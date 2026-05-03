"""
Backfill missing item-level projection rows from count_lines.

This script repairs projection completeness only. It reads authoritative
`sessions`, `count_lines`, and `event_log` data, reconstructs missing rows for
item-level projection collections, and is dry-run by default.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.config import settings
from backend.db.runtime import get_db, lifespan_db
from backend.services.canonical_inventory import (
    get_effective_approval_status,
    is_count_line_effectively_reviewed,
    is_superseded_count_line,
)

logger = logging.getLogger(__name__)

VERIFIED_COLLECTION = "verified_items_projection"
VARIANCE_COLLECTION = "variance_summary_projection"
FINANCIAL_COLLECTION = "financial_projection"
BATCH_COLLECTION = "batch_records"
EVENT_LOG_COLLECTION = "event_log"
DEFAULT_OUTPUT_PATH = Path(".agent/reports/item-projection-backfill.json")


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


def _resolve_output_path(path: Path) -> Path:
    return path if path.is_absolute() else PROJECT_ROOT / path


def _to_float(value: Any, *, default: float = 0.0) -> float:
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value: Any, *, default: int = 0) -> int:
    if value in (None, ""):
        return default
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _first_present(document: dict[str, Any], *field_names: str) -> Any:
    for field_name in field_names:
        value = document.get(field_name)
        if value not in (None, ""):
            return value
    return None


def _line_id(line: dict[str, Any]) -> str:
    return str(_first_present(line, "id", "count_line_id", "_id") or "").strip()


def _session_id(document: dict[str, Any]) -> str:
    return str(_first_present(document, "session_id", "id") or "").strip()


def _normalize_text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _normalize_datetime(value: Any) -> Optional[datetime]:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc).replace(tzinfo=None)
        except (OSError, ValueError):
            return None
    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return None
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
        if parsed.tzinfo is not None:
            return parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    return None


def _max_datetime(*values: Any) -> Optional[datetime]:
    candidates = [_normalize_datetime(value) for value in values]
    candidates = [value for value in candidates if value is not None]
    return max(candidates) if candidates else None


def _approval_status(line: dict[str, Any]) -> str:
    status = get_effective_approval_status(line)
    return status or "PENDING"


def _line_status(line: dict[str, Any]) -> str:
    return str(line.get("status") or "").strip() or _approval_status(line).lower()


def _variance_percentage(line: dict[str, Any]) -> float:
    erp_qty = _to_float(_first_present(line, "erp_qty", "stock_qty"))
    variance = _to_float(line.get("variance"))
    if erp_qty == 0:
        return 100.0 if variance != 0 else 0.0
    return round((variance / erp_qty) * 100, 4)


def _normalize_batches(line: dict[str, Any]) -> list[dict[str, Any]]:
    raw_batches = _first_present(line, "batches", "batch_values", "batch_records")
    normalized: list[dict[str, Any]] = []
    if isinstance(raw_batches, list):
        for entry in raw_batches:
            if isinstance(entry, dict):
                normalized.append(
                    {
                        "batch": _normalize_text(
                            _first_present(
                                entry,
                                "batch",
                                "batch_no",
                                "batch_number",
                                "batch_code",
                            )
                        )
                        or "NO_BATCH",
                        "qty": _to_float(
                            _first_present(entry, "qty", "quantity", "counted_qty")
                        ),
                    }
                )
            else:
                normalized.append({"batch": _normalize_text(entry) or "NO_BATCH", "qty": 0.0})
    else:
        batch = _normalize_text(
            _first_present(line, "batch", "batch_no", "batch_number", "batch_code")
        )
        normalized.append(
            {
                "batch": batch or "NO_BATCH",
                "qty": _to_float(_first_present(line, "counted_qty", "qty", "quantity")),
            }
        )
    normalized.sort(key=lambda item: (item["batch"], item["qty"]))
    return normalized


async def _fetch_session(db: AsyncIOMotorDatabase, session_id: str) -> dict[str, Any]:
    return (
        await db.sessions.find_one({"$or": [{"id": session_id}, {"session_id": session_id}]})
        or {}
    )


async def _fetch_latest_event(
    db: AsyncIOMotorDatabase,
    *,
    session_id: str,
    line_id: str,
) -> Optional[dict[str, Any]]:
    return await db[EVENT_LOG_COLLECTION].find_one(
        {
            "$or": [
                {"count_line_id": line_id},
                {"payload.count_line_id": line_id},
                {"line_id": line_id},
                {"payload.line_id": line_id},
                {"session_id": session_id},
                {"payload.session_id": session_id},
            ]
        },
        sort=[("timestamp", -1), ("created_at", -1)],
    )


def _common_item_row(
    line: dict[str, Any],
    session: dict[str, Any],
    latest_event: Optional[dict[str, Any]],
    *,
    now: datetime,
) -> dict[str, Any]:
    line_id = _line_id(line)
    session_id = _session_id(line)
    stock_qty = _to_float(_first_present(line, "erp_qty", "stock_qty"))
    counted_qty = _to_float(line.get("counted_qty"))
    mrp = _to_float(_first_present(line, "mrp_counted", "mrp_erp", "mrp"))
    approved_at = _first_present(line, "approved_at", "approval_at")
    approved_by = _first_present(line, "approved_by", "approval_by")
    verified = is_count_line_effectively_reviewed(line)
    return {
        "count_line_id": line_id,
        "approval_status": _approval_status(line),
        "approved_at": approved_at,
        "approved_by": approved_by,
        "barcode": line.get("barcode"),
        "batch_id": _first_present(line, "batch_id", "batch_no", "batch"),
        "blind_recount_required": bool(line.get("blind_recount_required", False)),
        "category": line.get("category_correction") or line.get("category"),
        "counted_at": line.get("counted_at"),
        "counted_by": line.get("counted_by") or line.get("created_by"),
        "counted_qty": counted_qty,
        "damaged_qty": _to_float(line.get("damaged_qty")),
        "dual_verification_required": bool(line.get("dual_verification_required", False)),
        "floor": _first_present(line, "floor_no", "floor_id", "floor"),
        "financial_impact": _to_float(line.get("financial_impact")),
        "id": line_id,
        "is_removed": False,
        "item_code": _normalize_text(line.get("item_code")),
        "item_id": _normalize_text(_first_present(line, "item_id", "item_code")),
        "item_name": line.get("item_name"),
        "last_event_id": str(_first_present(latest_event or {}, "id", "event_id", "_id") or "")
        or None,
        "last_event_type": _first_present(latest_event or {}, "event_type", "type"),
        "mrp": mrp,
        "mrp_erp": _to_float(line.get("mrp_erp")),
        "notes": _first_present(line, "variance_note", "remark", "notes"),
        "original_count_hidden": bool(line.get("original_count_hidden", False)),
        "projection_version": "backfill.item_projection.v1",
        "rack_id": _first_present(line, "rack_id", "rack_no", "rack"),
        "rack_no": _first_present(line, "rack_no", "rack_id", "rack"),
        "session_id": session_id,
        "status": _line_status(line),
        "stock_qty": stock_qty,
        "unit_value": mrp,
        "updated_at": now,
        "projection_updated_at": now,
        "variance": _to_float(line.get("variance")),
        "variance_percentage": _variance_percentage(line),
        "verified": verified,
        "verified_at": line.get("verified_at") or approved_at,
        "verified_by": line.get("verified_by") or approved_by,
        "warehouse": _first_present(line, "warehouse") or session.get("warehouse"),
    }


def build_verified_item_projection_row(
    line: dict[str, Any],
    session: dict[str, Any],
    latest_event: Optional[dict[str, Any]],
    *,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    return _common_item_row(line, session, latest_event, now=now or _utc_now())


def build_variance_projection_row(
    line: dict[str, Any],
    session: dict[str, Any],
    latest_event: Optional[dict[str, Any]],
    *,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    row = _common_item_row(line, session, latest_event, now=now or _utc_now())
    row["assigned_to"] = line.get("assigned_to")
    row["rejection_reason"] = line.get("rejection_reason")
    return row


def build_batch_projection_rows(
    line: dict[str, Any],
    latest_event: Optional[dict[str, Any]],
    *,
    now: Optional[datetime] = None,
) -> list[dict[str, Any]]:
    now = now or _utc_now()
    line_id = _line_id(line)
    session_id = _session_id(line)
    rows: list[dict[str, Any]] = []
    for batch in _normalize_batches(line):
        batch_no = batch["batch"] or "NO_BATCH"
        rows.append(
            {
                "count_line_id": line_id,
                "item_code": _normalize_text(line.get("item_code")),
                "batch_id": batch_no,
                "session_id": session_id,
                "batch_no": batch_no,
                "counted_at": line.get("counted_at"),
                "counted_by": line.get("counted_by") or line.get("created_by"),
                "counted_qty": _to_float(batch["qty"]),
                "damaged_qty": _to_float(line.get("damaged_qty")),
                "item_id": _normalize_text(_first_present(line, "item_id", "item_code")),
                "item_name": line.get("item_name"),
                "last_event_at": _first_present(latest_event or {}, "timestamp", "created_at"),
                "last_event_id": str(
                    _first_present(latest_event or {}, "id", "event_id", "_id") or ""
                )
                or None,
                "last_event_type": _first_present(latest_event or {}, "event_type", "type"),
                "projection_version": "backfill.item_projection.v1",
                "updated_at": now,
                "projection_updated_at": now,
            }
        )
    return rows


def build_financial_projection_row(
    session_id: str,
    lines: list[dict[str, Any]],
    *,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    now = now or _utc_now()
    total_counted_qty = sum(_to_float(line.get("counted_qty")) for line in lines)
    total_stock_qty = sum(_to_float(_first_present(line, "erp_qty", "stock_qty")) for line in lines)
    total_counted_value = sum(
        _to_float(line.get("counted_qty")) * _to_float(_first_present(line, "mrp_counted", "mrp"))
        for line in lines
    )
    total_stock_value = sum(
        _to_float(_first_present(line, "erp_qty", "stock_qty"))
        * _to_float(_first_present(line, "mrp_erp", "mrp"))
        for line in lines
    )
    damage_value = sum(
        _to_float(line.get("damaged_qty")) * _to_float(_first_present(line, "mrp_counted", "mrp"))
        for line in lines
    )
    overage_value = max(total_counted_value - total_stock_value, 0.0)
    shortage_value = max(total_stock_value - total_counted_value, 0.0)
    total_items = len(lines)
    verified_items = sum(1 for line in lines if is_count_line_effectively_reviewed(line))
    return {
        "session_id": session_id,
        "complete_percent": round((verified_items / total_items) * 100, 2) if total_items else 0.0,
        "damage_value": damage_value,
        "overage_value": overage_value,
        "projection_version": "backfill.item_projection.v1",
        "shortage_value": shortage_value,
        "total_counted_qty": total_counted_qty,
        "total_counted_value": total_counted_value,
        "total_stock_qty": total_stock_qty,
        "total_stock_value": total_stock_value,
        "updated_at": now,
        "projection_updated_at": now,
        "valuation_basis": "last_cost",
    }


async def _projection_row_exists(
    db: AsyncIOMotorDatabase,
    collection_name: str,
    *,
    line_id: str,
    session_id: str,
    item_code: str,
) -> bool:
    return (
        await db[collection_name].find_one(
            {
                "$or": [
                    {"count_line_id": line_id},
                    {"id": line_id},
                    {"session_id": session_id, "item_code": item_code},
                ]
            },
            {"_id": 1},
        )
        is not None
    )


async def _batch_row_exists(
    db: AsyncIOMotorDatabase,
    *,
    line_id: str,
    session_id: str,
    item_code: str,
    batch_no: str,
) -> bool:
    return (
        await db[BATCH_COLLECTION].find_one(
            {
                "$or": [
                    {"count_line_id": line_id, "batch_no": batch_no},
                    {
                        "session_id": session_id,
                        "item_code": item_code,
                        "batch_no": batch_no,
                    },
                ]
            },
            {"_id": 1},
        )
        is not None
    )


async def _financial_row_exists(db: AsyncIOMotorDatabase, session_id: str) -> bool:
    return await db[FINANCIAL_COLLECTION].find_one({"session_id": session_id}, {"_id": 1}) is not None


async def backfill_item_projection_collections(
    db: AsyncIOMotorDatabase,
    *,
    dry_run: bool = True,
    limit: Optional[int] = None,
    session_id: Optional[str] = None,
) -> dict[str, Any]:
    line_filter: dict[str, Any] = {"session_id": session_id} if session_id else {}
    now = _utc_now()
    stats: dict[str, Any] = {
        "mode": "dry-run" if dry_run else "execute",
        "count_lines_scanned": 0,
        "active_count_lines": 0,
        "missing_verified_items": 0,
        "missing_variance_items": 0,
        "missing_batch_rows": 0,
        "missing_financial_rows": 0,
        "inserted_verified_items": 0,
        "inserted_variance_items": 0,
        "inserted_batch_rows": 0,
        "inserted_financial_rows": 0,
        "skipped_superseded": 0,
        "skipped_missing_id": 0,
        "errors": 0,
        "candidate_lines": [],
        "candidate_financial_sessions": [],
    }
    lines_by_session: dict[str, list[dict[str, Any]]] = {}

    cursor = db.count_lines.find(line_filter).sort("counted_at", 1)
    if limit is not None:
        cursor = cursor.limit(limit)

    async for line in cursor:
        stats["count_lines_scanned"] += 1
        if is_superseded_count_line(line):
            stats["skipped_superseded"] += 1
            continue

        line_id = _line_id(line)
        current_session_id = _session_id(line)
        item_code = _normalize_text(line.get("item_code"))
        if not line_id or not current_session_id or not item_code:
            stats["skipped_missing_id"] += 1
            continue

        stats["active_count_lines"] += 1
        lines_by_session.setdefault(current_session_id, []).append(line)
        try:
            session = await _fetch_session(db, current_session_id)
            latest_event = await _fetch_latest_event(
                db,
                session_id=current_session_id,
                line_id=line_id,
            )
            missing_verified = not await _projection_row_exists(
                db,
                VERIFIED_COLLECTION,
                line_id=line_id,
                session_id=current_session_id,
                item_code=item_code,
            )
            missing_variance = not await _projection_row_exists(
                db,
                VARIANCE_COLLECTION,
                line_id=line_id,
                session_id=current_session_id,
                item_code=item_code,
            )
            batch_rows = build_batch_projection_rows(line, latest_event, now=now)
            missing_batch_rows = [
                row
                for row in batch_rows
                if not await _batch_row_exists(
                    db,
                    line_id=line_id,
                    session_id=current_session_id,
                    item_code=item_code,
                    batch_no=row["batch_no"],
                )
            ]

            if missing_verified:
                stats["missing_verified_items"] += 1
            if missing_variance:
                stats["missing_variance_items"] += 1
            stats["missing_batch_rows"] += len(missing_batch_rows)

            if missing_verified or missing_variance or missing_batch_rows:
                stats["candidate_lines"].append(
                    {
                        "count_line_id": line_id,
                        "session_id": current_session_id,
                        "item_code": item_code,
                        "variance": _to_float(line.get("variance")),
                        "missing_verified": missing_verified,
                        "missing_variance": missing_variance,
                        "missing_batch_rows": len(missing_batch_rows),
                    }
                )

            if dry_run:
                continue

            if missing_verified:
                await db[VERIFIED_COLLECTION].insert_one(
                    build_verified_item_projection_row(line, session, latest_event, now=now)
                )
                stats["inserted_verified_items"] += 1
            if missing_variance:
                await db[VARIANCE_COLLECTION].insert_one(
                    build_variance_projection_row(line, session, latest_event, now=now)
                )
                stats["inserted_variance_items"] += 1
            for row in missing_batch_rows:
                await db[BATCH_COLLECTION].insert_one(row)
                stats["inserted_batch_rows"] += 1
        except Exception:
            stats["errors"] += 1
            logger.exception(
                "Failed to build item projection rows",
                extra={"count_line_id": line_id, "session_id": current_session_id},
            )

    for current_session_id, lines in lines_by_session.items():
        try:
            if await _financial_row_exists(db, current_session_id):
                continue
            stats["missing_financial_rows"] += 1
            stats["candidate_financial_sessions"].append(
                {
                    "session_id": current_session_id,
                    "line_count": len(lines),
                    "financial_total": sum(_to_float(line.get("financial_impact")) for line in lines),
                }
            )
            if dry_run:
                continue
            await db[FINANCIAL_COLLECTION].insert_one(
                build_financial_projection_row(current_session_id, lines, now=now)
            )
            stats["inserted_financial_rows"] += 1
        except Exception:
            stats["errors"] += 1
            logger.exception(
                "Failed to build financial projection row",
                extra={"session_id": current_session_id},
            )

    return stats


def write_report(report: dict[str, Any], output_path: Path) -> Path:
    resolved = _resolve_output_path(output_path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(json.dumps(report, indent=2, default=_json_default) + "\n")
    return resolved


async def _run_backfill(args: argparse.Namespace) -> dict[str, Any]:
    async with lifespan_db(settings.MONGO_URL, settings.DB_NAME):
        db = get_db()
        if db is None:
            raise RuntimeError("Failed to get database connection")
        return await backfill_item_projection_collections(
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
        help="Insert missing projection rows. Without this flag the script is read-only.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional maximum number of count_lines to inspect.",
    )
    parser.add_argument(
        "--session-id",
        dest="session_id",
        default=None,
        help="Restrict the repair to one session id.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Path for the JSON backfill report.",
    )
    return parser


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    args = _build_parser().parse_args()
    stats = asyncio.run(_run_backfill(args))
    report_path = write_report(stats, args.output)

    print("\n=== Item Projection Backfill Results ===")
    print(f"Mode: {stats['mode']}")
    print(f"Count lines scanned: {stats['count_lines_scanned']}")
    print(f"Active count lines: {stats['active_count_lines']}")
    print(f"Missing verified item rows: {stats['missing_verified_items']}")
    print(f"Missing variance rows: {stats['missing_variance_items']}")
    print(f"Missing batch rows: {stats['missing_batch_rows']}")
    print(f"Missing financial rows: {stats['missing_financial_rows']}")
    print(f"Inserted verified item rows: {stats['inserted_verified_items']}")
    print(f"Inserted variance rows: {stats['inserted_variance_items']}")
    print(f"Inserted batch rows: {stats['inserted_batch_rows']}")
    print(f"Inserted financial rows: {stats['inserted_financial_rows']}")
    print(f"Errors: {stats['errors']}")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
