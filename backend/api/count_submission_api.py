"""
Count line submission endpoint with variance threshold checking
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from backend.api.schemas_variance import CountLineSubmission
from backend.auth.dependencies import get_current_user
from backend.db.runtime import get_db
from backend.services.variance_service import VarianceService

logger = logging.getLogger(__name__)
router = APIRouter()


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

    # Get count line
    count_line = await db.count_lines.find_one({"id": count_id})
    if not count_line:
        raise HTTPException(status_code=404, detail="Count line not found")

    # Check if already submitted
    if count_line.get("status") in ["submitted", "approved", "locked"]:
        raise HTTPException(status_code=400, detail="Count line already submitted")

    # H2 fix: Check parent session status — block submissions on finalized sessions
    session = await db.sessions.find_one(
        {
            "$or": [
                {"id": count_line.get("session_id")},
                {"session_id": count_line.get("session_id")},
            ]
        }
    )
    if session:
        session_status = str(session.get("status", "")).upper()
        if session_status in {"COMPLETED", "CLOSED", "CANCELLED"} or session.get("finalized_at"):
            raise HTTPException(
                status_code=400,
                detail="Cannot submit count lines for a finalized session",
            )

    # Get item details for variance calculation - prefer barcode for exact batch identification
    barcode = count_line.get("barcode")
    item = None
    if barcode:
        item = await db.erp_items.find_one({"barcode": barcode})

    if not item:
        # Fallback to item_code
        item = await db.erp_items.find_one({"item_code": count_line["item_code"]})

    if not item:
        raise HTTPException(status_code=404, detail="Item not found in ERP")

    # Initialize variance service
    variance_service = VarianceService(db)

    # Calculate variance
    # Use last_cost as default, can be made configurable
    unit_price = item.get("last_cost", 0) or item.get("sale_price", 0) or item.get("mrp", 0)

    variance_data = await variance_service.calculate_variance(
        item_code=count_line["item_code"],
        counted_qty=count_line.get("counted_qty", 0),
        expected_qty=item.get("stock_qty", 0),
        unit_price=unit_price,
        valuation_basis="last_cost",
    )

    # Check thresholds
    requires_approval, violated_thresholds = await variance_service.check_thresholds(
        variance_data,
        item_category=item.get("category"),
        location=count_line.get("floor_no"),  # or use rack_no, mark_location
    )

    # Determine new status
    new_status = "pending_approval" if requires_approval else "approved"

    # Build update data
    update_data = {
        "status": new_status,
        "variance_data": variance_data,
        "violated_thresholds": violated_thresholds,
        "requires_supervisor_approval": requires_approval,
        "submitted_at": datetime.now(timezone.utc).replace(tzinfo=None),
        "submitted_by": current_user["username"],
    }

    # If reason is required and not provided, reject submission
    if requires_approval:
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

    # Update count line
    await db.count_lines.update_one({"id": count_id}, {"$set": update_data})

    # H3 fix: Recompute session totals after status change
    from backend.services.canonical_inventory import recompute_session_totals

    try:
        await recompute_session_totals(db, count_line.get("session_id", ""))
    except Exception as e:
        logger.error(f"Failed to recompute session totals after submission: {e}")

    # Log activity
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

    logger.info(
        f"Count line {count_id} submitted by {current_user['username']}: "
        f"requires_approval={requires_approval}, violations={len(violated_thresholds)}"
    )

    return {
        "success": True,
        "requires_approval": requires_approval,
        "variance_data": variance_data,
        "violated_thresholds": violated_thresholds,
        "status": new_status,
        "message": (
            "Count submitted for supervisor approval"
            if requires_approval
            else "Count approved automatically"
        ),
    }
