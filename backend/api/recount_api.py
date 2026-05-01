"""
Recount Request API - Enhanced recount workflow with notifications and staff assignment
"""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.errors import PyMongoError
from pydantic import BaseModel

from backend.auth.dependencies import get_current_user
from backend.auth.permissions import Permission, require_permission
from backend.services.governance_guard import GovernanceViolation
from backend.services.notification_service import (
    NotificationPriority,
    NotificationType,
)
from backend.services.recount_service import RecountService, get_recount_service
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/recount", tags=["Recount"])
RECOUNT_ERRORS = (KeyError, PyMongoError, RuntimeError, TypeError, ValueError)


class RecountPriority(str, Enum):
    """Recount priority levels"""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class RecountStatus(str, Enum):
    """Recount request status"""

    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class RecountCreateRequest(BaseModel):
    """Request to create a recount"""

    count_line_id: str
    reason: str
    priority: RecountPriority = RecountPriority.MEDIUM
    assign_to: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    allow_self_assignment: bool = False


class RecountAssignRequest(BaseModel):
    """Request to assign recount to staff"""

    recount_id: str
    assign_to: str
    notes: Optional[str] = None


class RecountUpdateRequest(BaseModel):
    """Request to update recount status"""

    status: Optional[RecountStatus] = None
    notes: Optional[str] = None
    result_qty: Optional[float] = None


class RecountResponse(BaseModel):
    """Recount response"""

    id: str
    count_line_id: str
    item_name: str
    item_code: Optional[str]
    barcode: Optional[str]
    reason: str
    priority: str
    status: str
    created_by: str
    assigned_to: Optional[str]
    created_at: str
    updated_at: str
    due_date: Optional[str]
    completed_at: Optional[str]
    result_qty: Optional[float]


@router.post("/request", response_model=RecountResponse)
async def create_recount_request(
    request: RecountCreateRequest,
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
    recount_service: RecountService = Depends(get_recount_service),
):
    """Create a new recount request from a rejected count line."""
    try:
        count_line = await recount_service.get_count_line(request.count_line_id)
        if not count_line:
            raise HTTPException(status_code=404, detail="Count line not found")

        if count_line.get("status") not in ["rejected", "REJECTED"]:
            raise HTTPException(
                status_code=400, detail="Can only create recount from rejected count line"
            )

        now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
        recount_doc = {
            "count_line_id": request.count_line_id,
            "item_name": count_line.get("item_name", "Unknown"),
            "item_code": count_line.get("item_code"),
            "barcode": count_line.get("barcode"),
            "session_id": count_line.get("session_id"),
            "erp_qty": count_line.get("erp_qty"),
            "counted_qty": count_line.get("counted_qty"),
            "variance": count_line.get("variance"),
            "reason": request.reason,
            "priority": request.priority.value,
            "status": RecountStatus.PENDING.value,
            "created_by": current_user["username"],
            "assigned_to": request.assign_to,
            "notes": request.notes,
            "due_date": request.due_date,
            "created_at": now_dt,
            "updated_at": now_dt,
            "completed_at": None,
            "result_qty": None,
            "recount_iteration": int(count_line.get("recount_iteration", 0) or 0) + 1,
        }
        recount_doc = await recount_service.lifecycle.create_recount_request(
            recount_doc=recount_doc,
            actor=current_user["username"],
        )
        recount_doc["id"] = str(recount_doc.get("_id") or recount_doc.get("id") or "")

        target_user = request.assign_to or count_line.get("counted_by")
        if target_user:
            await recount_service.notifications.notify_recount_assigned(
                user_id=target_user,
                count_line_id=request.count_line_id,
                item_name=count_line.get("item_name", "Unknown"),
                reason=request.reason,
                assigned_by=current_user["username"],
                session_id=count_line.get("session_id"),
                item_code=count_line.get("item_code"),
                barcode=count_line.get("barcode"),
                assigned_to=request.assign_to,
            )

        return RecountResponse(
            id=recount_doc["id"],
            count_line_id=recount_doc["count_line_id"],
            item_name=recount_doc["item_name"],
            item_code=recount_doc.get("item_code"),
            barcode=recount_doc.get("barcode"),
            reason=recount_doc["reason"],
            priority=recount_doc["priority"],
            status=recount_doc["status"],
            created_by=recount_doc["created_by"],
            assigned_to=recount_doc.get("assigned_to"),
            created_at=recount_doc["created_at"].isoformat(),
            updated_at=recount_doc["updated_at"].isoformat(),
            due_date=recount_doc.get("due_date"),
            completed_at=None,
            result_qty=None,
        )

    except HTTPException:
        raise
    except GovernanceViolation as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RECOUNT_ERRORS as e:
        logger.error("Error creating recount request: %s", sanitize_for_logging(str(e)))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list", response_model=dict)
async def list_recount_requests(
    status: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    recount_service: RecountService = Depends(get_recount_service),
):
    """List recount requests with filters."""
    query = {}
    if status:
        query["status"] = status
    if assigned_to:
        query["assigned_to"] = assigned_to
    if priority:
        query["priority"] = priority

    requests, total = await recount_service.list_recount_requests(
        query=query,
        offset=offset,
        limit=limit,
    )

    return {
        "success": True,
        "total": total,
        "recount_requests": requests,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{recount_id}", response_model=RecountResponse)
async def get_recount_request(
    recount_id: str,
    current_user: dict = Depends(get_current_user),
    recount_service: RecountService = Depends(get_recount_service),
):
    """Get single recount request details."""
    recount = await recount_service.lifecycle.get_recount_request(recount_id)
    if not recount:
        raise HTTPException(status_code=404, detail="Recount request not found")

    recount["id"] = str(recount.get("_id") or recount.get("id") or recount_id)

    return RecountResponse(
        id=recount["id"],
        count_line_id=recount["count_line_id"],
        item_name=recount["item_name"],
        item_code=recount.get("item_code"),
        barcode=recount.get("barcode"),
        reason=recount["reason"],
        priority=recount["priority"],
        status=recount["status"],
        created_by=recount["created_by"],
        assigned_to=recount.get("assigned_to"),
        created_at=recount["created_at"].isoformat() if recount.get("created_at") else "",
        updated_at=recount["updated_at"].isoformat() if recount.get("updated_at") else "",
        due_date=recount.get("due_date"),
        completed_at=(
            recount.get("completed_at").isoformat() if recount.get("completed_at") else None
        ),
        result_qty=recount.get("result_qty"),
    )


@router.post("/assign")
async def assign_recount_request(
    request: RecountAssignRequest,
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
    recount_service: RecountService = Depends(get_recount_service),
):
    """Assign recount request to a staff member."""
    try:
        recount = await recount_service.lifecycle.get_recount_request(request.recount_id)
        if not recount:
            raise HTTPException(status_code=404, detail="Recount request not found")

        user = await recount_service.get_user(request.assign_to)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
        await recount_service.lifecycle.transition_recount_request(
            recount_id=request.recount_id,
            target_status=RecountStatus.ASSIGNED.value,
            actor=current_user["username"],
            fields={
                "assigned_to": request.assign_to,
                "assigned_at": now_dt,
                "assigned_by": current_user["username"],
                "notes": request.notes or recount.get("notes"),
                "updated_at": now_dt,
            },
        )

        await recount_service.notifications.notify_recount_assigned(
            user_id=request.assign_to,
            count_line_id=recount["count_line_id"],
            item_name=recount["item_name"],
            reason=recount["reason"],
            assigned_by=current_user["username"],
            session_id=recount.get("session_id"),
            item_code=recount.get("item_code"),
            barcode=recount.get("barcode"),
            assigned_to=request.assign_to,
        )

        return {"success": True, "message": f"Recount assigned to {request.assign_to}"}

    except HTTPException:
        raise
    except GovernanceViolation as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RECOUNT_ERRORS as e:
        logger.error("Error assigning recount: %s", sanitize_for_logging(str(e)))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{recount_id}/complete")
async def complete_recount_request(
    recount_id: str,
    request: RecountUpdateRequest,
    current_user: dict = Depends(get_current_user),
    recount_service: RecountService = Depends(get_recount_service),
):
    """Complete a recount request with results."""
    try:
        recount = await recount_service.lifecycle.get_recount_request(recount_id)
        if not recount:
            raise HTTPException(status_code=404, detail="Recount request not found")

        username = str(current_user.get("username") or "").strip()
        role = str(current_user.get("role") or "").strip().lower()
        is_privileged = role in {"supervisor", "admin"}
        assigned_to = str(recount.get("assigned_to") or "").strip()
        created_by = str(recount.get("created_by") or "").strip()
        if not is_privileged:
            if assigned_to and assigned_to != username:
                raise HTTPException(
                    status_code=403, detail="Only assigned staff can complete recount"
                )
            if not assigned_to and created_by and created_by != username:
                raise HTTPException(
                    status_code=403, detail="Not authorized to complete this recount"
                )

        now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
        update_data: dict[str, object] = {
            "updated_at": now_dt,
            "completed_at": now_dt,
            "completed_by": username,
        }
        if request.notes:
            update_data["completion_notes"] = request.notes

        if request.result_qty is None:
            await recount_service.lifecycle.transition_recount_request(
                recount_id=recount_id,
                target_status=RecountStatus.COMPLETED.value,
                actor=username,
                fields=update_data,
            )
        else:
            update_data["result_qty"] = request.result_qty
            await recount_service.complete_with_result(
                recount_id=recount_id,
                recount=recount,
                result_qty=request.result_qty,
                update_data=update_data,
                username=username,
            )

        await recount_service.notifications.create_notification(
            user_id=recount["created_by"],
            notification_type=NotificationType.RECOUNT_COMPLETED,
            title="Recount Completed",
            message=f"Recount for '{recount['item_name']}' has been completed",
            priority=NotificationPriority.MEDIUM,
            action_url=f"/recount/{recount_id}",
            metadata={"recount_id": recount_id, "result_qty": request.result_qty},
        )

        return {"success": True, "message": "Recount completed", "result_qty": request.result_qty}

    except HTTPException:
        raise
    except GovernanceViolation as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RECOUNT_ERRORS as e:
        logger.error("Error completing recount: %s", sanitize_for_logging(str(e)))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{recount_id}/cancel")
async def cancel_recount_request(
    recount_id: str,
    reason: Optional[str] = None,
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
    recount_service: RecountService = Depends(get_recount_service),
):
    """Cancel a recount request."""
    try:
        recount = await recount_service.lifecycle.get_recount_request(recount_id)
        if not recount:
            raise HTTPException(status_code=404, detail="Recount request not found")

        now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
        await recount_service.lifecycle.transition_recount_request(
            recount_id=recount_id,
            target_status=RecountStatus.CANCELLED.value,
            actor=current_user["username"],
            fields={
                "cancelled_at": now_dt,
                "cancelled_by": current_user["username"],
                "cancellation_reason": reason or "Cancelled by supervisor",
                "updated_at": now_dt,
            },
        )

        return {"success": True, "message": "Recount cancelled"}

    except HTTPException:
        raise
    except GovernanceViolation as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RECOUNT_ERRORS as e:
        logger.error("Error cancelling recount: %s", sanitize_for_logging(str(e)))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/summary")
async def get_recount_summary(
    current_user: dict = Depends(get_current_user),
    recount_service: RecountService = Depends(get_recount_service),
):
    """Get recount statistics summary."""
    return await recount_service.get_summary()


@router.get("/staff/{username}/tasks")
async def get_staff_recount_tasks(
    username: str,
    current_user: dict = Depends(get_current_user),
    recount_service: RecountService = Depends(get_recount_service),
):
    """Get recount tasks assigned to a staff member."""
    tasks = await recount_service.get_staff_tasks(username)
    return {"success": True, "tasks": tasks, "count": len(tasks)}
