"""
Verify count_lines identity index enforcement and canonical identity coverage.

Fails with non-zero exit code when:
- required unique index is missing or misconfigured
- duplicate identity rows exist
- canonical identity fields are missing
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.config import settings
from backend.db.runtime import get_db, lifespan_db

DEFAULT_OUTPUT_PATH = Path(".agent/reports/count-line-identity-index-verification.json")
REQUIRED_INDEX = "idx_session_item_id_barcode_unique"
REQUIRED_INDEX_KEY = [("session_id", 1), ("item_id", 1), ("barcode", 1)]


def _resolve_path(path: Path) -> Path:
    return path if path.is_absolute() else PROJECT_ROOT / path


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    if hasattr(value, "__class__") and value.__class__.__name__ == "ObjectId":
        return str(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


async def build_report() -> dict[str, Any]:
    async with lifespan_db(settings.MONGO_URL, settings.DB_NAME):
        db = get_db()
        index_info = await db.count_lines.index_information()
        required_index = index_info.get(REQUIRED_INDEX)

        missing_item_id = await db.count_lines.count_documents(
            {"$or": [{"item_id": {"$exists": False}}, {"item_id": None}, {"item_id": ""}]}
        )
        missing_barcode = await db.count_lines.count_documents(
            {"$or": [{"barcode": {"$exists": False}}, {"barcode": None}, {"barcode": ""}]}
        )

        duplicate_summary = await (
            db.count_lines.aggregate(
                [
                    {
                        "$group": {
                            "_id": {
                                "session_id": "$session_id",
                                "item_id": "$item_id",
                                "barcode": "$barcode",
                            },
                            "count": {"$sum": 1},
                        }
                    },
                    {"$match": {"count": {"$gt": 1}}},
                    {"$count": "groups"},
                ]
            )
        ).to_list(length=1)
        duplicate_groups = int(duplicate_summary[0]["groups"]) if duplicate_summary else 0

        index_key = required_index.get("key") if isinstance(required_index, dict) else None
        index_unique = bool(required_index.get("unique")) if isinstance(required_index, dict) else False
        index_sparse = bool(required_index.get("sparse")) if isinstance(required_index, dict) else False

        checks = {
            "index_exists": bool(required_index),
            "index_unique": index_unique,
            "index_non_sparse": not index_sparse,
            "index_key_matches": list(index_key or []) == REQUIRED_INDEX_KEY,
            "missing_item_id_zero": missing_item_id == 0,
            "missing_barcode_zero": missing_barcode == 0,
            "duplicate_groups_zero": duplicate_groups == 0,
        }
        passed = all(checks.values())

        return {
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
            "database": {"name": settings.DB_NAME},
            "required_index": REQUIRED_INDEX,
            "required_key": REQUIRED_INDEX_KEY,
            "index_document": required_index,
            "counts": {
                "missing_item_id": missing_item_id,
                "missing_barcode": missing_barcode,
                "duplicate_groups": duplicate_groups,
            },
            "checks": checks,
            "passed": passed,
            "failures": [name for name, ok in checks.items() if not ok],
        }


def write_report(report: dict[str, Any], output_path: Path) -> Path:
    resolved = _resolve_path(output_path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(json.dumps(report, indent=2, default=_json_default) + "\n")
    return resolved


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Path to store the verification JSON report.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    report = asyncio.run(build_report())
    output = write_report(report, args.output)

    print("=== Count-Line Identity Index Verification ===")
    print(f"Passed: {report['passed']}")
    print(f"Failures: {report['failures']}")
    print(f"Report: {output}")

    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
