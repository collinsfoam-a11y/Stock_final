"""
Backfill missing session dashboard projection rows from source collections.

This script repairs projection completeness only. It reads authoritative
`sessions`, `count_lines`, and `event_log` data, reconstructs missing
`session_dashboard_projection` rows, and is dry-run by default.
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

SESSION_PROJECTION_COLLECTION = "session_dashboard_projection"
EVENT_LOG_COLLECTION = "event_log"
DEFAULT_OUTPUT_PATH = Path(".agent/reports/session-dashboard-projection-backfill.json")


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


def _session_id(document: dict[str, Any]) -> str:
    value = _first_present(document, "session_id", "id")
    return str(value or "").strip()


def _projection_lookup(session_id: str) -> dict[str, Any]:
    return {"$or": [{"session_id": session_id}, {"id": session_id}]}


def _session_lookup(session_id: str) -> dict[str, Any]:
    return {"$or": [{"id": session_id}, {"session_id": session_id}]}


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


def _line_activity_at(line: dict[str, Any]) -> Optional[datetime]:
    return _max_datetime(
        line.get("updated_at"),
        line.get("approved_at"),
        line.get("verified_at"),
        line.get("counted_at"),
        line.get("created_at"),
    )


def _active_count_lines(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [line for line in lines if not is_superseded_count_line(line)]


def _requires_pending_approval(line: dict[str, Any]) -> bool:
    if is_count_line_effectively_reviewed(line):
        return False
    approval_status = get_effective_approval_status(line)
    status = str(line.get("status") or "").strip().lower()
    return approval_status in {"NEEDS_REVIEW", "REJECTED"} or status in {
        "pending_approval",
        "needs_review",
        "rejected",
    }


def _summary_from_sources(session: dict[str, Any], lines: list[dict[str, Any]]) -> dict[str, Any]:
    active_lines = _active_count_lines(lines)
    verified_items = sum(1 for line in active_lines if is_count_line_effectively_reviewed(line))
    damage_items = sum(_to_int(line.get("damaged_qty")) for line in active_lines)
    total_variance = sum(_to_float(line.get("variance")) for line in active_lines)
    positive_variance = sum(
        _to_float(line.get("variance"))
        for line in active_lines
        if _to_float(line.get("variance")) > 0
    )
    negative_variance = sum(
        _to_float(line.get("variance"))
        for line in active_lines
        if _to_float(line.get("variance")) < 0
    )
    total_items = len(active_lines)

    if not active_lines:
        total_items = _to_int(_first_present(session, "total_items", "item_count"))
        verified_items = _to_int(_first_present(session, "verified_items", "verified_count"))
        damage_items = _to_int(_first_present(session, "damage_items", "damaged_items"))
        total_variance = _to_float(_first_present(session, "total_variance", "variance_total"))
        positive_variance = _to_float(
            _first_present(session, "positive_variance", "overage_variance")
        )
        negative_variance = _to_float(
            _first_present(session, "negative_variance", "shortage_variance")
        )

    pending_items = max(total_items - verified_items, 0)
    pending_approvals = sum(1 for line in active_lines if _requires_pending_approval(line))
    line_activity = None
    for line in active_lines:
        line_activity = _max_datetime(line_activity, _line_activity_at(line))

    return {
        "total_items": total_items,
        "verified_items": verified_items,
        "pending_items": pending_items,
        "damage_items": damage_items,
        "total_variance": total_variance,
        "positive_variance": positive_variance,
        "negative_variance": negative_variance,
        "pending_approvals": pending_approvals,
        "line_activity": line_activity,
    }


def build_session_dashboard_projection_row(
    session: dict[str, Any],
    lines: list[dict[str, Any]],
    latest_event: Optional[dict[str, Any]],
    *,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    """Build one session projection row from authoritative source documents."""
    session_id = _session_id(session)
    if not session_id:
        raise ValueError("session is missing id/session_id")

    now = now or _utc_now()
    summary = _summary_from_sources(session, lines)
    started_at = _first_present(session, "started_at", "created_at")
    completed_at = _first_present(session, "finalized_at", "completed_at", "closed_at")
    source_latest_at = _max_datetime(
        session.get("updated_at"),
        session.get("last_activity"),
        session.get("last_heartbeat"),
        started_at,
        completed_at,
        summary["line_activity"],
        (latest_event or {}).get("timestamp"),
        (latest_event or {}).get("created_at"),
    )
    total_items = int(summary["total_items"])
    completion_percent = (
        round((int(summary["verified_items"]) / total_items) * 100, 2)
        if total_items > 0
        else 0.0
    )

    return {
        "session_id": session_id,
        "warehouse": session.get("warehouse"),
        "floor": _first_present(session, "floor", "floor_no", "location_name"),
        "floor_no": _first_present(session, "floor_no", "floor", "location_name"),
        "location_name": session.get("location_name"),
        "location_type": session.get("location_type"),
        "rack_no": _first_present(session, "rack_no", "rack_id", "rack"),
        "rack_id": _first_present(session, "rack_id", "rack_no", "rack"),
        "staff_user": _first_present(session, "staff_user", "username", "user_id"),
        "username": _first_present(session, "username", "staff_user", "user_id"),
        "staff_name": _first_present(session, "staff_name", "username", "staff_user"),
        "user_id": session.get("user_id"),
        "status": session.get("status"),
        "finalization_status": session.get("finalization_status"),
        "started_at": started_at,
        "created_at": session.get("created_at") or started_at,
        "completed_at": completed_at,
        "closed_at": session.get("closed_at"),
        "finalized_at": session.get("finalized_at"),
        "finalized_by": session.get("finalized_by"),
        "reconciled_at": session.get("reconciled_at"),
        "last_heartbeat": session.get("last_heartbeat"),
        "last_activity": source_latest_at,
        "total_items": total_items,
        "verified_items": int(summary["verified_items"]),
        "pending_items": int(summary["pending_items"]),
        "damage_items": int(summary["damage_items"]),
        "total_variance": float(summary["total_variance"]),
        "positive_variance": float(summary["positive_variance"]),
        "negative_variance": float(summary["negative_variance"]),
        "pending_approvals": int(summary["pending_approvals"]),
        "completion_percent": completion_percent,
        "snapshot_hash": session.get("snapshot_hash"),
        "snapshot_item_count": session.get("snapshot_item_count"),
        "notes": session.get("notes"),
        "type": session.get("type"),
        "version": session.get("version"),
        "last_event_id": str(
            _first_present(latest_event or {}, "id", "event_id", "_id") or ""
        )
        or None,
        "last_event_type": _first_present(latest_event or {}, "event_type", "type"),
        "source_updated_at": source_latest_at,
        "updated_at": now,
        "projection_updated_at": now,
        "projection_version": "backfill.session_dashboard.v1",
        "backfill_source": "sessions+count_lines+event_log",
        "backfilled_at": now,
    }


async def _fetch_count_lines(db: AsyncIOMotorDatabase, session_id: str) -> list[dict[str, Any]]:
    return [line async for line in db.count_lines.find({"session_id": session_id})]


async def _fetch_latest_event(
    db: AsyncIOMotorDatabase, session_id: str
) -> Optional[dict[str, Any]]:
    return await db[EVENT_LOG_COLLECTION].find_one(
        {"$or": [{"session_id": session_id}, {"payload.session_id": session_id}]},
        sort=[("timestamp", -1), ("created_at", -1)],
    )


async def _projection_exists(db: AsyncIOMotorDatabase, session_id: str) -> bool:
    return (
        await db[SESSION_PROJECTION_COLLECTION].find_one(
            _projection_lookup(session_id), {"_id": 1}
        )
        is not None
    )


async def _coverage_counts(
    db: AsyncIOMotorDatabase,
    *,
    session_filter: Optional[dict[str, Any]] = None,
) -> dict[str, int]:
    session_filter = session_filter or {}
    total_sessions = 0
    covered_sessions = 0
    async for session in db.sessions.find(session_filter):
        session_id = _session_id(session)
        if not session_id:
            continue
        total_sessions += 1
        if await _projection_exists(db, session_id):
            covered_sessions += 1
    return {"total_sessions": total_sessions, "covered_sessions": covered_sessions}


async def backfill_session_dashboard_projection(
    db: AsyncIOMotorDatabase,
    *,
    dry_run: bool = True,
    limit: Optional[int] = None,
    session_id: Optional[str] = None,
) -> dict[str, Any]:
    session_filter: dict[str, Any] = _session_lookup(session_id) if session_id else {}
    before = await _coverage_counts(db, session_filter=session_filter)
    stats: dict[str, Any] = {
        "mode": "dry-run" if dry_run else "execute",
        "sessions_scanned": 0,
        "missing_sessions": 0,
        "repairable_sessions": 0,
        "inserted_sessions": 0,
        "skipped_existing": 0,
        "skipped_missing_id": 0,
        "errors": 0,
        "missing_session_ids": [],
        "candidate_rows": [],
        "coverage_before": before,
        "coverage_after": None,
    }

    cursor = db.sessions.find(session_filter).sort("started_at", 1)
    if limit is not None:
        cursor = cursor.limit(limit)

    async for session in cursor:
        stats["sessions_scanned"] += 1
        current_session_id = _session_id(session)
        if not current_session_id:
            stats["skipped_missing_id"] += 1
            continue

        try:
            if await _projection_exists(db, current_session_id):
                continue

            stats["missing_sessions"] += 1
            stats["missing_session_ids"].append(current_session_id)
            lines = await _fetch_count_lines(db, current_session_id)
            latest_event = await _fetch_latest_event(db, current_session_id)
            row = build_session_dashboard_projection_row(
                session,
                lines,
                latest_event,
            )
            stats["repairable_sessions"] += 1
            stats["candidate_rows"].append(
                {
                    "session_id": current_session_id,
                    "total_items": row["total_items"],
                    "verified_items": row["verified_items"],
                    "pending_items": row["pending_items"],
                    "status": row["status"],
                    "warehouse": row["warehouse"],
                    "started_at": row["started_at"],
                    "source_updated_at": row["source_updated_at"],
                }
            )

            if dry_run:
                logger.info(
                    "Dry-run session dashboard projection backfill candidate",
                    extra={
                        "session_id": current_session_id,
                        "total_items": row["total_items"],
                    },
                )
                continue

            if await _projection_exists(db, current_session_id):
                stats["skipped_existing"] += 1
                continue
            await db[SESSION_PROJECTION_COLLECTION].insert_one(row)
            stats["inserted_sessions"] += 1
        except Exception:
            stats["errors"] += 1
            logger.exception(
                "Failed to build session dashboard projection row",
                extra={"session_id": current_session_id},
            )

    after = await _coverage_counts(db, session_filter=session_filter)
    if dry_run:
        after = {
            "total_sessions": before["total_sessions"],
            "covered_sessions": before["covered_sessions"] + stats["repairable_sessions"],
        }
    stats["coverage_after"] = after
    return stats


def _coverage_percent(counts: dict[str, int]) -> float:
    total = counts.get("total_sessions", 0)
    if not total:
        return 100.0
    return round((counts.get("covered_sessions", 0) / total) * 100, 2)


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
        return await backfill_session_dashboard_projection(
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
        help="Optional maximum number of sessions to inspect.",
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

    print("\n=== Session Dashboard Projection Backfill Results ===")
    print(f"Mode: {stats['mode']}")
    print(f"Sessions scanned: {stats['sessions_scanned']}")
    print(f"Missing sessions: {stats['missing_sessions']}")
    print(f"Repairable sessions: {stats['repairable_sessions']}")
    print(f"Inserted sessions: {stats['inserted_sessions']}")
    print(f"Skipped existing: {stats['skipped_existing']}")
    print(f"Errors: {stats['errors']}")
    print(f"Coverage before: {_coverage_percent(stats['coverage_before'])}%")
    print(f"Coverage after: {_coverage_percent(stats['coverage_after'])}%")
    print(f"Missing session IDs: {', '.join(stats['missing_session_ids']) or '-'}")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
