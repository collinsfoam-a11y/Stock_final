"""
Backfill empty session snapshots from ERP inventory data.

Repairs legacy `session_snapshots` documents with `item_count = 0` and keeps the
parent `sessions.snapshot_hash` metadata aligned with the repaired snapshot.
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.api.session_management_api import (
    _build_snapshot_payload_and_hash,
    _collect_snapshot_items,
)
from backend.config import settings
from backend.db.runtime import get_db, lifespan_db

logger = logging.getLogger(__name__)


async def _find_parent_session(
    db: AsyncIOMotorDatabase,
    session_id: str,
) -> Optional[dict[str, Any]]:
    return await db.sessions.find_one({"$or": [{"id": session_id}, {"session_id": session_id}]})


async def backfill_empty_session_snapshots(
    db: AsyncIOMotorDatabase,
    *,
    dry_run: bool = True,
    limit: Optional[int] = None,
    session_id: Optional[str] = None,
) -> dict[str, int]:
    stats = {
        "scanned": 0,
        "repairable": 0,
        "repaired": 0,
        "updated_sessions": 0,
        "missing_sessions": 0,
        "skipped_no_items": 0,
        "skipped_no_warehouse": 0,
        "errors": 0,
    }

    query: dict[str, Any] = {"item_count": 0}
    if session_id:
        query["session_id"] = session_id

    cursor = db.session_snapshots.find(query).sort("created_at", 1)
    if limit is not None:
        cursor = cursor.limit(limit)

    async for snapshot_doc in cursor:
        stats["scanned"] += 1
        current_session_id = str(snapshot_doc.get("session_id") or "")

        try:
            session_doc = None
            if current_session_id:
                session_doc = await _find_parent_session(db, current_session_id)
                if session_doc is None:
                    stats["missing_sessions"] += 1

            warehouse = (
                (session_doc or {}).get("warehouse") or snapshot_doc.get("warehouse") or ""
            ).strip()
            location_type = (session_doc or {}).get("location_type")
            location_name = (session_doc or {}).get("location_name")
            rack_no = (session_doc or {}).get("rack_no")

            if not warehouse:
                stats["skipped_no_warehouse"] += 1
                logger.info(
                    "Skipping snapshot without warehouse",
                    extra={"session_id": current_session_id, "snapshot_id": snapshot_doc.get("id")},
                )
                continue

            snapshot_items = await _collect_snapshot_items(
                db,
                warehouse,
                location_type=location_type,
                location_name=location_name,
                rack_no=rack_no,
            )

            if not snapshot_items:
                stats["skipped_no_items"] += 1
                logger.info(
                    "No ERP items found for empty snapshot",
                    extra={"session_id": current_session_id, "warehouse": warehouse},
                )
                continue

            items_payload, snapshot_hash = _build_snapshot_payload_and_hash(snapshot_items)
            stats["repairable"] += 1

            if dry_run:
                logger.info(
                    "Dry-run repair candidate",
                    extra={
                        "session_id": current_session_id,
                        "warehouse": warehouse,
                        "item_count": len(items_payload),
                    },
                )
                continue

            await db.session_snapshots.update_one(
                {"_id": snapshot_doc["_id"]},
                {
                    "$set": {
                        "warehouse": warehouse,
                        "items": items_payload,
                        "item_count": len(items_payload),
                        "snapshot_hash": snapshot_hash,
                    }
                },
            )
            stats["repaired"] += 1

            if session_doc is not None:
                session_update = {"snapshot_hash": snapshot_hash}
                if snapshot_doc.get("id") and not session_doc.get("snapshot_items_ref"):
                    session_update["snapshot_items_ref"] = snapshot_doc["id"]
                if snapshot_doc.get("config_version_id") and not session_doc.get(
                    "config_version_id"
                ):
                    session_update["config_version_id"] = snapshot_doc["config_version_id"]

                session_filter = (
                    {"_id": session_doc["_id"]}
                    if session_doc.get("_id")
                    else {"id": current_session_id}
                )
                session_result = await db.sessions.update_one(
                    session_filter,
                    {"$set": session_update},
                )
                if session_result.matched_count:
                    stats["updated_sessions"] += 1

            logger.info(
                "Repaired snapshot",
                extra={
                    "session_id": current_session_id,
                    "warehouse": warehouse,
                    "item_count": len(items_payload),
                },
            )
        except Exception:
            stats["errors"] += 1
            logger.exception(
                "Failed to repair snapshot",
                extra={"session_id": current_session_id, "snapshot_id": snapshot_doc.get("id")},
            )

    return stats


async def _run_backfill(args: argparse.Namespace) -> dict[str, int]:
    async with lifespan_db(settings.MONGO_URL, settings.DB_NAME):
        db = get_db()
        if db is None:
            raise RuntimeError("Failed to get database connection")

        return await backfill_empty_session_snapshots(
            db,
            dry_run=not args.execute,
            limit=args.limit,
            session_id=args.session_id,
        )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply snapshot repairs. Without this flag the script runs in dry-run mode.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional maximum number of empty snapshots to inspect.",
    )
    parser.add_argument(
        "--session-id",
        dest="session_id",
        default=None,
        help="Restrict the backfill to a single session id.",
    )
    return parser


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    args = _build_parser().parse_args()
    stats = asyncio.run(_run_backfill(args))

    print("\n=== Session Snapshot Backfill Results ===")
    print(f"Mode: {'execute' if args.execute else 'dry-run'}")
    print(f"Scanned: {stats['scanned']}")
    print(f"Repairable: {stats['repairable']}")
    print(f"Repaired: {stats['repaired']}")
    print(f"Updated sessions: {stats['updated_sessions']}")
    print(f"Missing sessions: {stats['missing_sessions']}")
    print(f"Skipped (no items): {stats['skipped_no_items']}")
    print(f"Skipped (no warehouse): {stats['skipped_no_warehouse']}")
    print(f"Errors: {stats['errors']}")


if __name__ == "__main__":
    main()
