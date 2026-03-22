"""
Repair count line and draft item_name values in MongoDB.

Targets records in `count_lines` and `count_line_drafts` where `item_name` is
missing or obviously wrong (empty, "Unknown Item", equal to item_code, or equal
to barcode). The repair source is MongoDB's `erp_items` collection only.
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

from backend.config import settings
from backend.db.runtime import get_db, lifespan_db

logger = logging.getLogger(__name__)

TARGET_COLLECTIONS = ("count_lines", "count_line_drafts")


def _meaningful_name(name: Any, item_code: Any = None, barcode: Any = None) -> bool:
    if not isinstance(name, str):
        return False

    normalized = name.strip()
    if not normalized:
        return False

    lowered = normalized.lower()
    if lowered in {"unknown item", "n/a"}:
        return False

    if item_code and normalized == str(item_code).strip():
        return False

    if barcode and normalized == str(barcode).strip():
        return False

    return True


def _bad_name_query() -> dict[str, Any]:
    query: dict[str, Any] = {
        "$or": [
            {"item_name": {"$exists": False}},
            {"item_name": None},
            {"item_name": ""},
            {"item_name": "Unknown Item"},
            {"item_name": "unknown item"},
            {"item_name": "N/A"},
            {"item_name": "n/a"},
            {"$expr": {"$eq": ["$item_name", "$item_code"]}},
            {"$expr": {"$eq": ["$item_name", "$barcode"]}},
        ]
    }
    return query


async def _lookup_erp_item_name(db: AsyncIOMotorDatabase, doc: dict[str, Any]) -> Optional[str]:
    item_code = str(doc.get("item_code") or "").strip()
    barcode = str(doc.get("barcode") or "").strip()

    erp_item = None
    if item_code:
        erp_item = await db.erp_items.find_one(
            {"item_code": item_code},
            {"item_name": 1, "barcode": 1},
        )

    if erp_item is None and barcode:
        erp_item = await db.erp_items.find_one(
            {"barcode": barcode},
            {"item_name": 1, "barcode": 1},
        )

    if not erp_item:
        return None

    item_name = erp_item.get("item_name")
    return item_name.strip() if isinstance(item_name, str) and item_name.strip() else None


async def repair_item_names(
    db: AsyncIOMotorDatabase,
    *,
    dry_run: bool = True,
    limit: Optional[int] = None,
    session_id: Optional[str] = None,
    collections: tuple[str, ...] = TARGET_COLLECTIONS,
) -> dict[str, Any]:
    stats: dict[str, Any] = {
        "scanned": 0,
        "candidates": 0,
        "repairable": 0,
        "repaired": 0,
        "skipped_no_erp_match": 0,
        "skipped_no_meaningful_name": 0,
        "errors": 0,
        "per_collection": {
            collection: {
                "candidates": 0,
                "repairable": 0,
                "repaired": 0,
            }
            for collection in collections
        },
        "examples": [],
    }

    for collection_name in collections:
        collection = db[collection_name]
        query = _bad_name_query()
        if session_id:
            query["session_id"] = session_id

        cursor = collection.find(query).sort(
            [("counted_at", 1), ("updated_at", 1), ("_id", 1)]
        )

        async for doc in cursor:
            if limit is not None and stats["scanned"] >= limit:
                return stats

            stats["scanned"] += 1
            stats["candidates"] += 1
            stats["per_collection"][collection_name]["candidates"] += 1

            try:
                repaired_name = await _lookup_erp_item_name(db, doc)
                if not repaired_name:
                    stats["skipped_no_erp_match"] += 1
                    continue

                if not _meaningful_name(repaired_name, doc.get("item_code"), doc.get("barcode")):
                    stats["skipped_no_meaningful_name"] += 1
                    continue

                stats["repairable"] += 1
                stats["per_collection"][collection_name]["repairable"] += 1

                if len(stats["examples"]) < 10:
                    stats["examples"].append(
                        {
                            "collection": collection_name,
                            "id": str(doc.get("id") or doc.get("_id") or ""),
                            "session_id": str(doc.get("session_id") or ""),
                            "item_code": str(doc.get("item_code") or ""),
                            "before": doc.get("item_name"),
                            "after": repaired_name,
                        }
                    )

                if dry_run:
                    logger.info(
                        "Dry-run repair candidate",
                        extra={
                            "collection": collection_name,
                            "item_code": doc.get("item_code"),
                            "before": doc.get("item_name"),
                            "after": repaired_name,
                        },
                    )
                else:
                    result = await collection.update_one(
                        {"_id": doc["_id"]},
                        {"$set": {"item_name": repaired_name}},
                    )
                    if result.modified_count:
                        stats["repaired"] += 1
                        stats["per_collection"][collection_name]["repaired"] += 1
            except Exception:
                stats["errors"] += 1
                logger.exception(
                    "Failed to evaluate item_name repair candidate",
                    extra={
                        "collection": collection_name,
                        "id": str(doc.get("id") or doc.get("_id") or ""),
                        "item_code": doc.get("item_code"),
                    },
                )

    return stats


async def _run(args: argparse.Namespace) -> dict[str, Any]:
    async with lifespan_db(settings.MONGO_URL, settings.DB_NAME):
        db = get_db()
        if db is None:
            raise RuntimeError("Failed to get database connection")

        target_collections = tuple(
            collection.strip()
            for collection in (args.collections.split(",") if args.collections else TARGET_COLLECTIONS)
            if collection.strip()
        )

        return await repair_item_names(
            db,
            dry_run=not args.execute,
            limit=args.limit,
            session_id=args.session_id,
            collections=target_collections,
        )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply repairs. Without this flag the script runs in dry-run mode.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional maximum number of candidate documents to inspect.",
    )
    parser.add_argument(
        "--session-id",
        dest="session_id",
        default=None,
        help="Restrict repairs to a single session id.",
    )
    parser.add_argument(
        "--collections",
        default="count_lines,count_line_drafts",
        help="Comma-separated Mongo collections to inspect.",
    )
    return parser


def _print_summary(stats: dict[str, Any], execute: bool) -> None:
    print("\n=== Count Line Item Name Repair Results ===")
    print(f"Mode: {'execute' if execute else 'dry-run'}")
    print(f"Scanned: {stats['scanned']}")
    print(f"Candidates: {stats['candidates']}")
    print(f"Repairable: {stats['repairable']}")
    print(f"Repaired: {stats['repaired']}")
    print(f"Skipped (no ERP match): {stats['skipped_no_erp_match']}")
    print(f"Skipped (no meaningful ERP name): {stats['skipped_no_meaningful_name']}")
    print(f"Errors: {stats['errors']}")
    print("Per collection:")
    for collection, collection_stats in stats["per_collection"].items():
        print(
            f"  - {collection}: candidates={collection_stats['candidates']}, "
            f"repairable={collection_stats['repairable']}, repaired={collection_stats['repaired']}"
        )

    if stats["examples"]:
        print("Examples:")
        for example in stats["examples"]:
            print(
                f"  - {example['collection']} | session={example['session_id']} | "
                f"item_code={example['item_code']} | before={example['before']!r} | "
                f"after={example['after']!r}"
            )


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    args = _build_parser().parse_args()
    stats = asyncio.run(_run(args))
    _print_summary(stats, args.execute)


if __name__ == "__main__":
    main()
