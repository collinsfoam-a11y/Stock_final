"""
Canonical inventory helpers shared by session, count-line, and sync flows.

The active source of truth for stock verification is:
- sessions
- count_lines
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional


ACTIVE_SESSION_STATUSES = {"OPEN", "ACTIVE", "PAUSED", "RECONCILE"}
FINALIZED_SESSION_STATUSES = {"COMPLETED", "CLOSED", "CANCELLED"}
LOCKED_COUNT_LINE_STATUSES = {"locked"}
APPROVED_COUNT_LINE_STATUSES = {"approved", "locked"}
BLOCKING_APPROVAL_STATUSES = {"NEEDS_REVIEW", "REJECTED"}
BLOCKING_COUNT_LINE_STATUSES = {"rejected"}


def normalize_location_value(value: Any) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    normalized = value.strip()
    return normalized or None


def normalize_session_status(value: Any, *, reconciled_at: Any = None) -> str:
    if not isinstance(value, str) or not value.strip():
        return "UNKNOWN"

    normalized = value.strip().upper()
    if normalized == "IN_PROGRESS":
        normalized = "ACTIVE"
    if normalized == "RECONCILING":
        normalized = "RECONCILE"
    if normalized == "ACTIVE" and reconciled_at:
        return "RECONCILE"
    return normalized


def normalize_count_line_status(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        return "pending"
    return value.strip().lower()


def normalize_approval_status(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        return "PENDING"
    return value.strip().upper()


def build_session_lookup(session_id: str) -> dict[str, Any]:
    return {"$or": [{"id": session_id}, {"session_id": session_id}]}


async def find_session(db: Any, session_id: str) -> Optional[dict[str, Any]]:
    return await db.sessions.find_one(build_session_lookup(session_id))


def extract_document_id(document: dict[str, Any]) -> Optional[str]:
    value = document.get("id") or document.get("_id")
    if value is None:
        return None
    return str(value)


def is_session_finalized(session: Optional[dict[str, Any]]) -> bool:
    if not session:
        return False
    if session.get("finalized_at"):
        return True
    return (
        normalize_session_status(
            session.get("status"),
            reconciled_at=session.get("reconciled_at"),
        )
        in FINALIZED_SESSION_STATUSES
    )


def is_count_line_locked(count_line: Optional[dict[str, Any]]) -> bool:
    if not count_line:
        return False
    if count_line.get("finalized_at"):
        return True
    return normalize_count_line_status(count_line.get("status")) in LOCKED_COUNT_LINE_STATUSES


def build_count_line_duplicate_filter(line_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "session_id": str(line_data.get("session_id") or ""),
        "item_code": str(line_data.get("item_code") or ""),
        "floor_no": normalize_location_value(line_data.get("floor_no")),
        "rack_no": normalize_location_value(line_data.get("rack_no")),
    }


def is_explicit_recount(line_data: dict[str, Any]) -> bool:
    recount_of_id = line_data.get("recount_of_id")
    if recount_of_id:
        return True
    recount_mode = line_data.get("recount_mode")
    if isinstance(recount_mode, str) and recount_mode.strip().upper() == "RECOUNT":
        return True
    return bool(line_data.get("recount"))


async def find_duplicate_count_line(
    db: Any,
    line_data: dict[str, Any],
    *,
    exclude_id: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    duplicate_filter = build_count_line_duplicate_filter(line_data)
    cursor = db.count_lines.find(duplicate_filter)
    async for existing in cursor:
        existing_id = extract_document_id(existing)
        if exclude_id and existing_id == exclude_id:
            continue
        return existing
    return None


def can_reuse_rejected_count_line(existing: Optional[dict[str, Any]], line_data: dict[str, Any]) -> bool:
    if not existing or not is_explicit_recount(line_data):
        return False

    recount_of_id = line_data.get("recount_of_id")
    if recount_of_id and extract_document_id(existing) != str(recount_of_id):
        return False

    return normalize_count_line_status(existing.get("status")) in BLOCKING_COUNT_LINE_STATUSES


def is_blocking_finalization(count_line: dict[str, Any]) -> bool:
    if is_count_line_locked(count_line):
        return False

    if normalize_count_line_status(count_line.get("status")) in BLOCKING_COUNT_LINE_STATUSES:
        return True

    if normalize_approval_status(count_line.get("approval_status")) in BLOCKING_APPROVAL_STATUSES:
        return True

    if count_line.get("assigned_to") and count_line.get("recount_requested_at"):
        return True

    return False


async def get_session_count_lines(db: Any, session_id: str) -> list[dict[str, Any]]:
    cursor = db.count_lines.find({"session_id": session_id})
    lines: list[dict[str, Any]] = []
    async for line in cursor:
        lines.append(line)
    return lines


async def recompute_session_totals(db: Any, session_id: str) -> dict[str, Any]:
    total_items = 0
    total_variance = 0.0
    verified_items = 0
    damage_items = 0
    last_activity: Optional[datetime] = None

    cursor = db.count_lines.find({"session_id": session_id})
    async for line in cursor:
        total_items += 1
        total_variance += float(line.get("variance") or 0.0)
        damage_items += int(float(line.get("damaged_qty") or 0.0))

        line_status = normalize_count_line_status(line.get("status"))
        if bool(line.get("verified")) or line_status in APPROVED_COUNT_LINE_STATUSES:
            verified_items += 1

        candidate_activity = line.get("updated_at") or line.get("approved_at") or line.get("counted_at")
        if isinstance(candidate_activity, datetime):
            if candidate_activity.tzinfo is not None:
                candidate_activity = candidate_activity.astimezone(timezone.utc).replace(
                    tzinfo=None
                )
            if last_activity is None or candidate_activity > last_activity:
                last_activity = candidate_activity

    session_update: dict[str, Any] = {
        "total_items": total_items,
        "total_variance": total_variance,
        "verified_items": verified_items,
        "pending_items": max(total_items - verified_items, 0),
        "damage_items": damage_items,
    }
    if last_activity is not None:
        session_update["last_activity"] = last_activity

    await db.sessions.update_one(build_session_lookup(session_id), {"$set": session_update})
    return session_update
