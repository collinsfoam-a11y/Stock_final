"""
Count line submission endpoint with variance threshold checking
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException

from backend.api.schemas_variance import CountLineSubmission
from backend.auth.dependencies import get_current_user
from backend.db.runtime import get_db
from backend.services.count_line_write_service import CountLineWriteService
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)
router = APIRouter()


def _safe_log_value(value: Any, *, max_length: int = 120) -> str:
    return sanitize_for_logging("" if value is None else str(value), max_length=max_length)


async def _get_submittable_count_line(db: Any, count_id: str) -> dict[str, Any]:
    count_line = await db.count_lines.find_one({"id": count_id})
    if not count_line:
        raise HTTPException(status_code=404, detail="Count line not found")
    if count_line.get("status") in ["submitted", "approved", "locked"]:
        raise HTTPException(status_code=400, detail="Count line already submitted")
    return count_line


async def _ensure_session_accepts_submission(db: Any, session_id: str) -> None:
    session = await db.sessions.find_one(
        {"$or": [{"id": session_id}, {"session_id": session_id}]}
    )
    if not session:
        return

    session_status = str(session.get("status", "")).upper()
    if session_status in {"COMPLETED", "CLOSED", "CANCELLED"} or session.get("finalized_at"):
        raise HTTPException(
            status_code=400,
            detail="Cannot submit count lines for a finalized session",
        )


async def _get_count_submission_item(db: Any, count_line: dict[str, Any]) -> dict[str, Any]:
    barcode = count_line.get("barcode")
    if barcode:
        item = await db.erp_items.find_one({"barcode": barcode})
        if item:
            return item

    item = await db.erp_items.find_one({"item_code": count_line["item_code"]})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in ERP")
    return item


async def _evaluate_submission_variance(
    db: Any,
    count_line: dict[str, Any],
    item: dict[str, Any],
    *,
    variance_reason: Optional[str] = None,
) -> tuple[dict[str, Any], bool, list[dict[str, Any]]]:
    session = await db.sessions.find_one(
        {"$or": [{"id": count_line.get("session_id")}, {"session_id": count_line.get("session_id")}]}
    )
    governance = await CountLineWriteService(db).evaluate_existing_count_line(
        session=session or {"id": count_line.get("session_id")},
        count_line=count_line,
        counted_qty=float(count_line.get("counted_qty", 0) or 0),
        erp_item=item,
        variance_reason=variance_reason,
        correction_reason=count_line.get("correction_reason"),
        location=count_line.get("floor_no"),
    )
    return (
        governance.variance_data,
        governance.requires_supervisor_approval,
        governance.violated_thresholds,
    )


def _build_submission_update_data(
    submission_data: CountLineSubmission,
    current_user: dict[str, Any],
    *,
    requires_approval: bool,
    variance_data: dict[str, Any],
    violated_thresholds: list[dict[str, Any]],
) -> dict[str, Any]:
    update_data = {
        "status": "pending_approval" if requires_approval else "approved",
        "variance_data": variance_data,
        "violated_thresholds": violated_thresholds,
        "requires_supervisor_approval": requires_approval,
        "submitted_at": datetime.now(timezone.utc).replace(tzinfo=None),
        "submitted_by": current_user["username"],
    }

    if not requires_approval:
        return update_data

    requires_reason = any(t.get("require_reason") for t in violated_thresholds)
    if requires_reason and not submission_data.variance_reason:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Variance reason is required for this count",
                "violated_thresholds": violated_thresholds,
                "variance_data": variance_data,
            },
        )

    if submission_data.variance_reason:
        update_data["variance_reason"] = submission_data.variance_reason
    return update_data


async def _recompute_submission_session_totals(db: Any, session_id: str) -> None:
    from backend.services.canonical_inventory import recompute_session_totals

    try:
        await recompute_session_totals(db, session_id)
    except Exception as exc:
        logger.error(
            "Failed to recompute session totals after submission: %s",
            _safe_log_value(exc, max_length=200),
        )


async def _record_submission_activity(
    db: Any,
    current_user: dict[str, Any],
    count_id: str,
    count_line: dict[str, Any],
    *,
    requires_approval: bool,
    variance_data: dict[str, Any],
    violated_thresholds: list[dict[str, Any]],
) -> None:
    await db.activity_logs.insert_one(
        {
            "user_id": current_user.get("user_id"),
            "username": current_user.get("username"),
            "action": "count_line_submitted",
            "resource_type": "count_line",
            "resource_id": count_id,
            "metadata": {
                "requires_approval": requires_approval,
                "variance_data": variance_data,
                "violated_thresholds": violated_thresholds,
                "item_code": count_line["item_code"],
            },
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
        }
    )


@router.post("/count-lines/{count_id}/submit")
async def submit_count_line(
    count_id: str,
    submission_data: CountLineSubmission,
    current_user: dict = Depends(get_current_user),
):
    """
    Submit count line for approval.
    Automatically checks variance thresholds and routes to supervisor if needed.

    Args:
        count_id: ID of the count line to submit
        submission_data: Submission payload with optional variance reason
        current_user: Authenticated user

    Returns:
        {
            "success": bool,
            "requires_approval": bool,
            "variance_data": {...},
            "violated_thresholds": [...],
            "status": str
        }
    """
    db = get_db()

    count_line = await _get_submittable_count_line(db, count_id)
    await _ensure_session_accepts_submission(db, count_line.get("session_id", ""))
    item = await _get_count_submission_item(db, count_line)
    variance_data, requires_approval, violated_thresholds = await _evaluate_submission_variance(
        db,
        count_line,
        item,
        variance_reason=submission_data.variance_reason,
    )
    update_data = _build_submission_update_data(
        submission_data,
        current_user,
        requires_approval=requires_approval,
        variance_data=variance_data,
        violated_thresholds=violated_thresholds,
    )
    await CountLineWriteService(db).process_write(
        {
            "operation": "update_one",
            "filter": {"id": count_id},
            "update": {"$set": update_data},
        },
        context={"session_id": str(count_line.get("session_id") or "")},
    )
    await _recompute_submission_session_totals(db, count_line.get("session_id", ""))
    await _record_submission_activity(
        db,
        current_user,
        count_id,
        count_line,
        requires_approval=requires_approval,
        variance_data=variance_data,
        violated_thresholds=violated_thresholds,
    )

    logger.info(
        "Count line %s submitted by %s: requires_approval=%s, violations=%s",
        _safe_log_value(count_id),
        _safe_log_value(current_user.get("username")),
        requires_approval,
        len(violated_thresholds),
    )

    return {
        "success": True,
        "requires_approval": requires_approval,
        "variance_data": variance_data,
        "violated_thresholds": violated_thresholds,
        "status": update_data["status"],
        "message": (
            "Count submitted for supervisor approval"
            if requires_approval
            else "Count approved automatically"
        ),
    }
