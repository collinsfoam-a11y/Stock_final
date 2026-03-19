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


class BatchRejectionRequest(BaseModel):
    """Request for batch rejection"""

    count_line_ids: List[str] = Field(..., description="List of count line IDs to reject")
    rejection_reason: str = Field(..., description="Reason for rejection")
    assign_to: Optional[str] = Field(None, description="User to assign recount to")


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
