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
SUPERSEDED_COUNT_LINE_STATUSES = {"superseded"}


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


def requires_supervisor_review_for_variance(variance: Any) -> bool:
    try:
        return abs(float(variance or 0.0)) > 0.0
    except (TypeError, ValueError):
        return False


def count_line_requires_supervisor_review(count_line: Optional[dict[str, Any]]) -> bool:
    if not count_line:
        return False
    return requires_supervisor_review_for_variance(count_line.get("variance"))


def is_count_line_effectively_reviewed(count_line: Optional[dict[str, Any]]) -> bool:
    if not count_line:
        return False

    line_status = normalize_count_line_status(count_line.get("status"))
    if bool(count_line.get("verified")) or line_status in APPROVED_COUNT_LINE_STATUSES:
        return True

    if normalize_approval_status(count_line.get("approval_status")) in BLOCKING_APPROVAL_STATUSES:
        return False

    if count_line.get("assigned_to") and count_line.get("recount_requested_at"):
        return False

    return not count_line_requires_supervisor_review(count_line) and line_status != "rejected"


def get_effective_count_line_status(count_line: Optional[dict[str, Any]]) -> str:
    if not count_line:
        return "pending"

    line_status = normalize_count_line_status(count_line.get("status"))
    if line_status in {"rejected", "locked", "approved"}:
        return line_status
    if is_count_line_effectively_reviewed(count_line):
        return "approved"
    return line_status


def get_effective_approval_status(count_line: Optional[dict[str, Any]]) -> str:
    if not count_line:
        return "PENDING"

    approval_status = normalize_approval_status(count_line.get("approval_status"))
    if approval_status in {"REJECTED", "APPROVED"}:
        return approval_status
    if is_count_line_effectively_reviewed(count_line):
        return "APPROVED"
    return approval_status


def materialize_count_line_review_state(count_line: dict[str, Any]) -> dict[str, Any]:
    """Project a count line with the effective review state used by live reads."""
    line = dict(count_line)
    line["status"] = get_effective_count_line_status(count_line)
    line["approval_status"] = get_effective_approval_status(count_line)
    return line


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


def is_superseded_count_line(count_line: Optional[dict[str, Any]]) -> bool:
    if not count_line:
        return False
    if normalize_count_line_status(count_line.get("status")) in SUPERSEDED_COUNT_LINE_STATUSES:
        return True
    if count_line.get("superseded_by_version_id"):
        return True
    if count_line.get("superseded_at"):
        return True
    return False


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
    requested_batch_id = line_data.get("batch_id")
    cursor = db.count_lines.find(duplicate_filter)
    async for existing in cursor:
        existing_id = extract_document_id(existing)
        if exclude_id and existing_id == exclude_id:
            continue
        if is_superseded_count_line(existing):
            continue
        # BSR Part D: two different, explicitly identified batches counted
        # at the same item/location are legitimately separate counts, not a
        # duplicate scan -- only applies when both sides actually specify a
        # batch_id; absent batch context on either side preserves the
        # existing (pre-batch-tracking) same-location duplicate behavior.
        existing_batch_id = existing.get("batch_id")
        if requested_batch_id and existing_batch_id and requested_batch_id != existing_batch_id:
            continue
        return existing
    return None


def can_reuse_rejected_count_line(
    existing: Optional[dict[str, Any]], line_data: dict[str, Any]
) -> bool:
    if not existing or not is_explicit_recount(line_data):
        return False

    recount_of_id = line_data.get("recount_of_id")
    if recount_of_id and extract_document_id(existing) != str(recount_of_id):
        return False

    return normalize_count_line_status(existing.get("status")) in BLOCKING_COUNT_LINE_STATUSES


def is_blocking_finalization(count_line: dict[str, Any]) -> bool:
    if is_superseded_count_line(count_line):
        return False

    if is_count_line_locked(count_line):
        return False

    if normalize_count_line_status(count_line.get("status")) in BLOCKING_COUNT_LINE_STATUSES:
        return True

    if count_line.get("assigned_to") and count_line.get("recount_requested_at"):
        return True

    if normalize_approval_status(count_line.get("approval_status")) in BLOCKING_APPROVAL_STATUSES:
        return True

    if not count_line_requires_supervisor_review(count_line):
        return False

    # C3+MM10 fix: If supervisor review IS required AND the line is not yet approved, block.
    # An APPROVED line should NOT block finalization (supervisor already signed off).
    approval = normalize_approval_status(count_line.get("approval_status"))
    if approval == "APPROVED":
        return False

    return True


async def get_session_count_lines(
    db: Any,
    session_id: str,
    *,
    include_superseded: bool = False,
) -> list[dict[str, Any]]:
    cursor = db.count_lines.find({"session_id": session_id})
    lines: list[dict[str, Any]] = []
    async for line in cursor:
        if not include_superseded and is_superseded_count_line(line):
            continue
        lines.append(line)
    return lines


def _normalize_activity_timestamp(candidate_activity: Any) -> Optional[datetime]:
    """Coerce a count-line activity field (str/int/float/datetime) to a naive UTC datetime."""
    if candidate_activity is None:
        return None
    if isinstance(candidate_activity, (int, float)):
        try:
            return datetime.fromtimestamp(candidate_activity, tz=timezone.utc).replace(
                tzinfo=None
            )
        except (ValueError, OSError):
            return None
    if isinstance(candidate_activity, str):
        try:
            return datetime.fromisoformat(candidate_activity.replace("Z", "+00:00")).replace(
                tzinfo=None
            )
        except (ValueError, TypeError):
            return None
    if isinstance(candidate_activity, datetime):
        if candidate_activity.tzinfo is not None:
            return candidate_activity.astimezone(timezone.utc).replace(tzinfo=None)
        return candidate_activity
    return None


def _compute_session_totals_from_lines(lines: list[dict[str, Any]]) -> dict[str, Any]:
    """Pure aggregation used by both the single-session and batched recompute paths.

    Kept as a standalone function (rather than inlined per-session) so the two
    callers can never drift in what "session totals" means.
    """
    total_items = 0
    total_variance = 0.0
    verified_items = 0
    damage_items = 0
    last_activity: Optional[datetime] = None

    for line in lines:
        if is_superseded_count_line(line):
            continue
        total_items += 1
        total_variance += float(line.get("variance") or 0.0)
        damage_items += int(float(line.get("damaged_qty") or 0.0))

        if is_count_line_effectively_reviewed(line):
            verified_items += 1

        # M5 fix: Handle non-datetime values (strings, floats) from sync paths
        candidate_activity = _normalize_activity_timestamp(
            line.get("updated_at") or line.get("approved_at") or line.get("counted_at")
        )
        if candidate_activity is not None:
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

    return session_update


async def recompute_session_totals(
    db: Any,
    session_id: str,
    *,
    lifecycle_service: Any,
) -> dict[str, Any]:
    lines = [line async for line in db.count_lines.find({"session_id": session_id})]
    session_update = _compute_session_totals_from_lines(lines)
    await lifecycle_service.update_session_totals(session_id, session_update)
    return session_update


async def recompute_session_totals_batch(
    db: Any,
    session_ids: list[str],
    *,
    lifecycle_service: Any,
) -> dict[str, dict[str, Any]]:
    """Same result as calling `recompute_session_totals` once per session_id, but
    issues a single `count_lines` query instead of one per session.

    Per-session writes (OCC version check, audit log, projection sync) still
    happen individually via `lifecycle_service.update_session_totals` -- only
    the read is batched, since those writes are governed, non-batchable state
    transitions.
    """
    unique_ids = list(dict.fromkeys(session_ids))
    if not unique_ids:
        return {}

    lines_by_session: dict[str, list[dict[str, Any]]] = {session_id: [] for session_id in unique_ids}
    cursor = db.count_lines.find({"session_id": {"$in": unique_ids}})
    async for line in cursor:
        bucket = lines_by_session.get(str(line.get("session_id") or ""))
        if bucket is not None:
            bucket.append(line)

    results: dict[str, dict[str, Any]] = {}
    for session_id in unique_ids:
        session_update = _compute_session_totals_from_lines(lines_by_session[session_id])
        await lifecycle_service.update_session_totals(session_id, session_update)
        results[session_id] = session_update

    return results
