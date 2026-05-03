"""
Publish projection readiness from a passing parity report.

The script is dry-run by default. It refuses to publish readiness when the
source parity report is missing or inconsistent.
"""

from __future__ import annotations

import argparse
import asyncio
import json
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

DEFAULT_OUTPUT_PATH = Path(".agent/reports/projection-readiness-publish.json")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


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


def _resolve_path(path: Path) -> Path:
    return path if path.is_absolute() else PROJECT_ROOT / path


def _load_report(path: Path) -> dict[str, Any]:
    resolved = _resolve_path(path)
    return json.loads(resolved.read_text())


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def build_readiness_document(
    parity_report: dict[str, Any],
    *,
    source_report: Path,
    now: datetime | None = None,
) -> dict[str, Any]:
    if parity_report.get("is_consistent") is not True:
        raise ValueError("Cannot publish readiness from a failing parity report")

    metrics = parity_report.get("metrics") if isinstance(parity_report.get("metrics"), dict) else {}
    now = now or _utc_now()
    return {
        "_id": str(getattr(settings, "PROJECTION_READINESS_DOCUMENT_ID", "current")),
        "is_consistent": True,
        "is_ready": True,
        "ready": True,
        "parity_passed": True,
        "projection_drift_count": int(metrics.get("projection_drift_count") or 0),
        "projection_gap_count": int(metrics.get("projection_gap_count") or 0),
        "projection_lag_seconds": _to_float(metrics.get("event_lag_seconds"), 0.0),
        "message": "Projection parity validation passed.",
        "source_report": str(source_report),
        "updated_at": now,
        "validated_at": now,
        "healthy_since": now,
        "stability_since": now,
    }


async def publish_projection_readiness(
    db: AsyncIOMotorDatabase,
    *,
    parity_report: dict[str, Any],
    source_report: Path,
    dry_run: bool = True,
) -> dict[str, Any]:
    collection_name = str(getattr(settings, "PROJECTION_READINESS_COLLECTION", "projection_readiness"))
    document_id = str(getattr(settings, "PROJECTION_READINESS_DOCUMENT_ID", "current"))
    existing = await db[collection_name].find_one({"_id": document_id})
    document = build_readiness_document(parity_report, source_report=source_report)
    if not dry_run:
        await db[collection_name].replace_one({"_id": document_id}, document, upsert=True)
    return {
        "mode": "dry-run" if dry_run else "execute",
        "collection": collection_name,
        "document_id": document_id,
        "existing_ready": bool((existing or {}).get("ready") or (existing or {}).get("is_ready")),
        "existing_updated_at": (existing or {}).get("updated_at"),
        "published": not dry_run,
        "document": document,
    }


def write_report(report: dict[str, Any], output_path: Path) -> Path:
    resolved = _resolve_path(output_path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(json.dumps(report, indent=2, default=_json_default) + "\n")
    return resolved


async def _run(args: argparse.Namespace) -> dict[str, Any]:
    parity_report = _load_report(args.parity_report)
    async with lifespan_db(settings.MONGO_URL, settings.DB_NAME):
        db = get_db()
        if db is None:
            raise RuntimeError("Failed to get database connection")
        return await publish_projection_readiness(
            db,
            parity_report=parity_report,
            source_report=args.parity_report,
            dry_run=not args.execute,
        )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("parity_report", type=Path)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Publish readiness. Without this flag the script is read-only.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Path for the JSON publish report.",
    )
    return parser


def main() -> None:
    args = _build_parser().parse_args()
    report = asyncio.run(_run(args))
    report_path = write_report(report, args.output)
    print("\n=== Projection Readiness Publish Results ===")
    print(f"Mode: {report['mode']}")
    print(f"Collection: {report['collection']}")
    print(f"Document: {report['document_id']}")
    print(f"Published: {report['published']}")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
