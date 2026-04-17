"""
Enhanced Supervisor Workflow API - Batch operations and photo enforcement
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from backend.auth.permissions import Permission, require_permission
from backend.db.runtime import get_db
from backend.services.count_state_machine import CountLineState, CountLineStateMachine
from backend.services.notification_service import NotificationService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/supervisor", tags=["Supervisor Workflow"])


def _get_user_id(current_user: dict) -> str:
    return (
        current_user.get("username")
        or current_user.get("user_id")
        or current_user.get("id")
        or str(current_user.get("_id", "unknown"))
    )


# Request/Response Models


class BatchApprovalRequest(BaseModel):
    """Request for batch approval"""

    count_line_ids: List[str] = Field(..., description="List of count line IDs to approve")
    require_photos: bool = Field(default=True, description="Require photo proof")
    approval_notes: Optional[str] = Field(None, description="Optional approval notes")
    skip_variance_check: bool = Field(default=False, description="Skip variance threshold check")
    variance_threshold: Optional[float] = Field(None, description="Custom variance threshold")


class BatchRejectionRequest(BaseModel):
    """Request for batch rejection"""

    count_line_ids: List[str] = Field(..., description="List of count line IDs to reject")
    rejection_reason: str = Field(..., description="Reason for rejection")
    assign_to: Optional[str] = Field(None, description="User to assign recount to")
    force: bool = Field(default=False, description="Force rejection even if already reviewed")


class QuickApproveRequest(BaseModel):
    """Quick approve with variance threshold"""

    session_id: str = Field(..., description="Session ID for quick approve all")
    variance_threshold: float = Field(default=10.0, description="Maximum variance to auto-approve")
    max_items: int = Field(default=100, description="Maximum items to approve")


class WorkflowAnalyticsRequest(BaseModel):
    """Request for workflow analytics"""

    start_date: Optional[str] = Field(None, description="Start date (ISO format)")
    end_date: Optional[str] = Field(None, description="End date (ISO format)")
    user_id: Optional[str] = Field(None, description="Filter by user ID")


class BatchOperationResponse(BaseModel):
    """Response for batch operations"""

    success: bool
    total: int
    succeeded: int
    failed: int
    results: List[dict]
    message: str


class PhotoRequirementCheck(BaseModel):
    """Photo requirement check result"""

    count_line_id: str
    has_photos: bool
    photo_count: int
    requires_photos: bool
    can_approve: bool


# API Endpoints


@router.post("/batch-approve", response_model=BatchOperationResponse)
async def batch_approve_count_lines(
    request: BatchApprovalRequest,
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Approve multiple count lines at once.

    Optionally enforce photo requirement.
    Sends notifications to count line owners.
    """
    try:
        state_machine = CountLineStateMachine(db)
        notification_service = NotificationService(db)
        actor_id = _get_user_id(current_user)
        actor_name = current_user.get("username") or actor_id

        results: List[Dict[str, Any]] = []
        succeeded = 0
        failed = 0

        # ⚡ Bolt: Fixed N+1 query. Fetched all count lines in a single query and mapped them for O(1) lookup.
        count_lines_cursor = db.count_lines.find({"id": {"$in": request.count_line_ids}})
        count_lines_list = await count_lines_cursor.to_list(length=None)
        count_lines_map = {cl.get("id"): cl for cl in count_lines_list}

        for count_line_id in request.count_line_ids:
            try:
                # Get count line
                count_line = count_lines_map.get(count_line_id)
                if not count_line:
                    results.append(
                        {
                            "count_line_id": count_line_id,
                            "success": False,
                            "error": "Count line not found",
                        }
                    )
                    failed += 1
                    continue

                # Check photo requirement
                if request.require_photos:
                    has_photos = bool(
                        count_line.get("photo_proofs") or count_line.get("photo_base64")
                    )

                    if not has_photos:
                        results.append(
                            {
                                "count_line_id": count_line_id,
                                "success": False,
                                "error": "Photo proof required for approval",
                            }
                        )
                        failed += 1
                        continue

                # Approve
                result = await state_machine.transition(
                    count_line_id=count_line_id,
                    next_state=CountLineState.APPROVED.value,
                    user_id=actor_id,
                    user_role=current_user.get("role", "supervisor"),
                    reason=request.approval_notes,
                )

                # Notify owner
                owner_id = count_line.get("counted_by") or count_line.get("created_by")
                if owner_id:
                    await notification_service.notify_count_approved(
                        user_id=owner_id,
                        count_line_id=count_line_id,
                        item_name=count_line.get("item_name", "Unknown"),
                        approved_by=actor_name,
                    )

                results.append(
                    {
                        "count_line_id": count_line_id,
                        "success": True,
                        "previous_state": result["previous_state"],
                        "new_state": result["new_state"],
                    }
                )
                succeeded += 1

            except Exception as e:
                logger.error(f"Error approving count line {count_line_id}: {e}")
                results.append({"count_line_id": count_line_id, "success": False, "error": str(e)})
                failed += 1

        return BatchOperationResponse(
            success=succeeded > 0,
            total=len(request.count_line_ids),
            succeeded=succeeded,
            failed=failed,
            results=results,
            message=f"Approved {succeeded}/{len(request.count_line_ids)} count lines",
        )

    except Exception as e:
        logger.error(f"Error in batch approval: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch-reject", response_model=BatchOperationResponse)
async def batch_reject_count_lines(
    request: BatchRejectionRequest,
    current_user: dict = require_permission(Permission.COUNT_LINE_REJECT),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Reject multiple count lines and request recount.

    Optionally assign to specific user.
    Sends notifications to assigned users.
    """
    try:
        state_machine = CountLineStateMachine(db)
        notification_service = NotificationService(db)
        actor_id = _get_user_id(current_user)
        actor_name = current_user.get("username") or actor_id

        results = []
        succeeded = 0
        failed = 0

        # ⚡ Bolt: Fixed N+1 query. Fetched all count lines in a single query and mapped them for O(1) lookup.
        count_lines_cursor = db.count_lines.find({"id": {"$in": request.count_line_ids}})
        count_lines_list = await count_lines_cursor.to_list(length=None)
        count_lines_map = {cl.get("id"): cl for cl in count_lines_list}

        for count_line_id in request.count_line_ids:
            try:
                # Get count line
                count_line = count_lines_map.get(count_line_id)
                if not count_line:
                    results.append(
                        {
                            "count_line_id": count_line_id,
                            "success": False,
                            "error": "Count line not found",
                        }
                    )
                    failed += 1
                    continue

                # Reject
                result = await state_machine.transition(
                    count_line_id=count_line_id,
                    next_state=CountLineState.REJECTED.value,
                    user_id=actor_id,
                    user_role=current_user.get("role", "supervisor"),
                    reason=request.rejection_reason,
                    metadata={"assigned_to": request.assign_to} if request.assign_to else None,
                )

                # Update assignment if specified
                if request.assign_to:
                    await db.count_lines.update_one(
                        {"id": count_line_id}, {"$set": {"assigned_to": request.assign_to}}
                    )

                # Notify assigned user or owner
                notify_user = request.assign_to or count_line.get("counted_by")
                if notify_user:
                    await notification_service.notify_recount_assigned(
                        user_id=notify_user,
                        count_line_id=count_line_id,
                        item_name=count_line.get("item_name", "Unknown"),
                        reason=request.rejection_reason,
                        assigned_by=actor_name,
                    )

                results.append(
                    {
                        "count_line_id": count_line_id,
                        "success": True,
                        "previous_state": result["previous_state"],
                        "new_state": result["new_state"],
                        "assigned_to": request.assign_to,
                    }
                )
                succeeded += 1

            except Exception as e:
                logger.error(f"Error rejecting count line {count_line_id}: {e}")
                results.append({"count_line_id": count_line_id, "success": False, "error": str(e)})
                failed += 1

        return BatchOperationResponse(
            success=succeeded > 0,
            total=len(request.count_line_ids),
            succeeded=succeeded,
            failed=failed,
            results=results,
            message=f"Rejected {succeeded}/{len(request.count_line_ids)} count lines",
        )

    except Exception as e:
        logger.error(f"Error in batch rejection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/check-photo-requirements")
async def check_photo_requirements(
    count_line_ids: List[str] = Body(...),
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Check photo requirements for multiple count lines.

    Returns which count lines have photos and which require them.
    """
    try:
        results: List[Dict[str, Any]] = []

        # ⚡ Bolt: Fixed N+1 query. Fetched all count lines in a single query and mapped them for O(1) lookup.
        count_lines_cursor = db.count_lines.find({"id": {"$in": count_line_ids}})
        count_lines = await count_lines_cursor.to_list(length=None)
        count_lines_map = {cl.get("id"): cl for cl in count_lines}

        for count_line_id in count_line_ids:
            count_line = count_lines_map.get(count_line_id)

            if not count_line:
                results.append({"count_line_id": count_line_id, "error": "Not found"})
                continue

            # Check if has photos
            has_photos = bool(count_line.get("photo_proofs") or count_line.get("photo_base64"))

            photo_count = 0
            if count_line.get("photo_proofs"):
                photo_count = len(count_line["photo_proofs"])
            elif count_line.get("photo_base64"):
                photo_count = 1

            # Determine if photos are required
            # Photos required if:
            # 1. Large variance (>100 units or >50%)
            # 2. High value item (MRP > 10000)
            # 3. Damage reported
            variance = abs(count_line.get("variance", 0))
            erp_qty = count_line.get("erp_qty", 0)
            variance_percent = (variance / erp_qty * 100) if erp_qty > 0 else 0
            mrp = count_line.get("mrp_erp", 0)
            has_damage = count_line.get("damaged_qty", 0) > 0

            requires_photos = variance > 100 or variance_percent > 50 or mrp > 10000 or has_damage

            results.append(
                {
                    "count_line_id": count_line_id,
                    "has_photos": has_photos,
                    "photo_count": photo_count,
                    "requires_photos": requires_photos,
                    "can_approve": has_photos or not requires_photos,
                    "reason": (
                        "Large variance"
                        if variance > 100
                        else (
                            "High variance %"
                            if variance_percent > 50
                            else (
                                "High value item"
                                if mrp > 10000
                                else "Damage reported"
                                if has_damage
                                else None
                            )
                        )
                    ),
                }
            )

        return {"success": True, "total": len(count_line_ids), "results": results}

    except Exception as e:
        logger.error(f"Error checking photo requirements: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending-approvals")
async def get_pending_approvals(
    limit: int = 50,
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Get all count lines pending supervisor approval.

    Returns count lines in pending_approval or NEEDS_REVIEW status.
    """
    try:
        count_lines = (
            await db.count_lines.find({"status": {"$in": ["pending_approval", "NEEDS_REVIEW"]}})
            .sort("submitted_at", -1)
            .limit(limit)
            .to_list(limit)
        )

        # Convert ObjectId to string
        for line in count_lines:
            line["_id"] = str(line["_id"])

        return {"success": True, "total": len(count_lines), "count_lines": count_lines}

    except Exception as e:
        logger.error(f"Error getting pending approvals: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/quick-approve")
async def quick_approve_count_lines(
    request: QuickApproveRequest,
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Quick approve all count lines below variance threshold.

    Returns list of approved count lines.
    """
    try:
        state_machine = CountLineStateMachine(db)
        actor_id = _get_user_id(current_user)

        threshold = request.variance_threshold
        max_items = request.max_items

        query = {
            "session_id": request.session_id,
            "status": {"$in": ["pending", "PENDING", "submitted"]},
            "variance": {"$exists": True},
        }

        count_lines_cursor = db.count_lines.find(query).sort("submitted_at", -1).limit(max_items)
        count_lines_list = await count_lines_cursor.to_list(length=max_items)

        results = []
        succeeded = 0
        skipped = 0

        for count_line in count_lines_list:
            cl_id = count_line.get("id")
            variance = abs(count_line.get("variance") or 0)
            erp_qty = count_line.get("erp_qty") or 0

            if erp_qty > 0 and variance / erp_qty > threshold:
                skipped += 1
                continue

            try:
                await state_machine.transition(
                    count_line_id=cl_id,
                    next_state=CountLineState.APPROVED.value,
                    user_id=actor_id,
                    user_role=current_user.get("role", "supervisor"),
                    reason=f"Quick approve - variance {variance} within threshold",
                )
                results.append({"count_line_id": cl_id, "success": True})
                succeeded += 1
            except Exception as e:
                results.append({"count_line_id": cl_id, "success": False, "error": str(e)})

        return {
            "success": True,
            "session_id": request.session_id,
            "variance_threshold": threshold,
            "total_scanned": len(count_lines_list),
            "approved": succeeded,
            "skipped": skipped,
            "results": results[:50],
        }

    except Exception as e:
        logger.error(f"Error in quick approve: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics")
async def get_workflow_analytics(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Get workflow analytics for supervisors.

    Returns approval/rejection stats, average processing time, and user performance.
    """
    try:
        from datetime import datetime

        date_query: Dict[str, datetime] = {}
        if start_date:
            date_query["$gte"] = datetime.fromisoformat(start_date)
        if end_date:
            date_query["$lte"] = datetime.fromisoformat(end_date)

        approval_match: Dict[str, Any] = {"status": "approved"}
        if date_query:
            approval_match["approved_at"] = date_query

        approval_pipeline: List[Dict[str, Any]] = [
            {"$match": approval_match},
            {
                "$group": {
                    "_id": "$approved_by",
                    "count": {"$sum": 1},
                    "avg_variance": {"$avg": "$variance"},
                }
            },
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
        approval_cursor = db.count_lines.aggregate(approval_pipeline)
        approvals = await approval_cursor.to_list(10)

        rejection_match: Dict[str, Any] = {"status": "rejected"}
        if date_query:
            rejection_match["rejected_at"] = date_query

        rejection_pipeline: List[Dict[str, Any]] = [
            {"$match": rejection_match},
            {"$group": {"_id": "$rejected_by", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
        rejection_cursor = db.count_lines.aggregate(rejection_pipeline)
        rejections = await rejection_cursor.to_list(10)

        total_approved = sum(a.get("count", 0) for a in approvals)
        total_rejected = sum(r.get("count", 0) for r in rejections)

        return {
            "success": True,
            "date_range": {"start": start_date, "end": end_date},
            "summary": {
                "total_approved": total_approved,
                "total_rejected": total_rejected,
                "approval_rate": round(total_approved / (total_approved + total_rejected) * 100, 2)
                if total_approved + total_rejected > 0
                else 0,
            },
            "top_approvers": [
                {
                    "user": a.get("_id"),
                    "count": a.get("count"),
                    "avg_variance": round(a.get("avg_variance") or 0, 2),
                }
                for a in approvals
            ],
            "top_rejectors": [{"user": r.get("_id"), "count": r.get("count")} for r in rejections],
        }

    except Exception as e:
        logger.error(f"Error getting workflow analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))
