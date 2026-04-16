"""
Archive and remove synthetic smoke-test session data from MongoDB.

Targets synthetic sessions identified by empty `session_snapshots` warehouse labels such
as `SMOKE-*`, `BODY-TEST*`, and `stale-auth-*`. The cleanup archives documents into
`data_archive` before deleting from the operational collections.
"""

import argparse
import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.config import settings
from backend.db.runtime import get_db, lifespan_db

logger = logging.getLogger(__name__)

SYNTHETIC_WAREHOUSE_PREFIXES = (
    "smoke-",
    "supseed-",
    "supsmoke-",
    "locator-test",
    "body-test",
    "direct-test",
    "net-test",
    "err-test",
    "final-smoke-",
    "picker-test",
    "stale-auth-",
)


def _is_synthetic_warehouse(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    normalized = value.strip().lower()
    return any(normalized.startswith(prefix) for prefix in SYNTHETIC_WAREHOUSE_PREFIXES)


def _build_collection_query(collection_name: str, session_ids: list[str]) -> dict[str, Any]:
    if collection_name == "sessions":
        return {"$or": [{"id": {"$in": session_ids}}, {"session_id": {"$in": session_ids}}]}
    return {"session_id": {"$in": session_ids}}


async def cleanup_synthetic_session_data(
    db: AsyncIOMotorDatabase,
    *,
    dry_run: bool = True,
    limit: int | None = None,
) -> dict[str, Any]:
    stats: dict[str, Any] = {
        "scanned_empty_snapshots": 0,
        "synthetic_snapshots": 0,
        "synthetic_session_ids": 0,
        "archived": 0,
        "deleted": 0,
        "collections": {},
    }

    cursor = db.session_snapshots.find({"item_count": 0}).sort("created_at", 1)
    if limit is not None:
        cursor = cursor.limit(limit)

    synthetic_snapshots: list[dict[str, Any]] = []
    session_ids: list[str] = []

    async for snapshot_doc in cursor:
        stats["scanned_empty_snapshots"] += 1
        if not _is_synthetic_warehouse(snapshot_doc.get("warehouse")):
            continue
        synthetic_snapshots.append(snapshot_doc)
        session_id = str(snapshot_doc.get("session_id") or "")
        if session_id:
            session_ids.append(session_id)

    unique_session_ids = sorted(set(session_ids))
    stats["synthetic_snapshots"] = len(synthetic_snapshots)
    stats["synthetic_session_ids"] = len(unique_session_ids)

    collections = ("session_snapshots", "sessions", "verification_sessions", "count_lines")

    for collection_name in collections:
        query = _build_collection_query(collection_name, unique_session_ids)
        matched = await db[collection_name].count_documents(query)
        stats["collections"][collection_name] = {
            "matched": matched,
            "archived": 0,
            "deleted": 0,
        }

        if dry_run or matched == 0:
            continue

        cursor = db[collection_name].find(query)
        archive_docs = []
        async for doc in cursor:
            archive_docs.append(
                {
                    "source_collection": collection_name,
                    "archived_at": datetime.now(timezone.utc).replace(tzinfo=None),
                    "cleanup_reason": "synthetic_session_data_cleanup",
                    "original_id": str(doc.pop("_id")),
                    "session_id": doc.get("session_id") or doc.get("id"),
                    "data": doc,
                }
            )

        if archive_docs:
            await db.data_archive.insert_many(archive_docs)
            stats["archived"] += len(archive_docs)
            stats["collections"][collection_name]["archived"] = len(archive_docs)

        delete_result = await db[collection_name].delete_many(query)
        stats["deleted"] += delete_result.deleted_count
        stats["collections"][collection_name]["deleted"] = delete_result.deleted_count

        logger.info(
            "Cleaned synthetic session collection",
            extra={
                "collection": collection_name,
                "matched": matched,
                "archived": len(archive_docs),
                "deleted": delete_result.deleted_count,
            },
        )

    return stats


async def _run_cleanup(args: argparse.Namespace) -> dict[str, Any]:
    async with lifespan_db(settings.MONGO_URL, settings.DB_NAME):
        db = get_db()
        if db is None:
            raise RuntimeError("Failed to get database connection")
        return await cleanup_synthetic_session_data(
            db,
            dry_run=not args.execute,
            limit=args.limit,
        )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply the cleanup. Without this flag the script runs in dry-run mode.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional maximum number of empty snapshots to inspect.",
    )
    return parser


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    args = _build_parser().parse_args()
    stats = asyncio.run(_run_cleanup(args))

    print("\n=== Synthetic Session Cleanup Results ===")
    print(f"Mode: {'execute' if args.execute else 'dry-run'}")
    print(f"Scanned empty snapshots: {stats['scanned_empty_snapshots']}")
    print(f"Synthetic snapshots: {stats['synthetic_snapshots']}")
    print(f"Synthetic session ids: {stats['synthetic_session_ids']}")
    print(f"Archived docs: {stats['archived']}")
    print(f"Deleted docs: {stats['deleted']}")
    for collection_name, collection_stats in stats["collections"].items():
        print(
            f"{collection_name}: matched={collection_stats['matched']}, "
            f"archived={collection_stats['archived']}, deleted={collection_stats['deleted']}"
        )


if __name__ == "__main__":
    main()
