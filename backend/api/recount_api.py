"""
Recount Request API - Enhanced recount workflow with notifications and staff assignment
"""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any, NoReturn, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.auth.dependencies import get_current_user
from backend.auth.permissions import Permission, require_permission
from backend.db.runtime import get_db
from backend.services.canonical_inventory import find_session
from backend.services.logic_guard import build_request_context, enforce_session_logic
from backend.services.notification_service import (
    NotificationPriority,
    NotificationService,
    NotificationType,
)
from backend.services.count_line_write_service import CountLineWriteService
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/recount", tags=["Recount"])


def _safe_log_value(value: object, *, max_length: int = 200) -> str:
    return sanitize_for_logging("" if value is None else str(value), max_length=max_length)


def _raise_recount_internal_error(detail: str, exc: Exception) -> NoReturn:
    raise HTTPException(status_code=500, detail=detail) from exc


async def _enforce_recount_session_logic(
    *,
    db: AsyncIOMotorDatabase,
    session: dict[str, Any],
    request: Request | None,
    current_user: dict[str, Any],
    operation_name: str,
) -> None:
    await enforce_session_logic(
        db=db,
        session=session,
        request_context=build_request_context(
            request=request,
            current_user=current_user,
            session_id=str(session.get("id") or session.get("session_id") or ""),
            warehouse=session.get("warehouse"),
            endpoint_name="recount_api",
            operation_name=operation_name,
        ),
        is_mutation=True,
    )


async def _load_recount_session_or_409(
    db: AsyncIOMotorDatabase,
    session_id: Optional[str],
) -> dict[str, Any]:
    if not session_id:
        raise HTTPException(status_code=409, detail="Recount request is missing session context")

    session = await find_session(db, str(session_id))
    if not session:
        raise HTTPException(status_code=409, detail="Associated session not found")
    return session


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
    request: Request,
    payload: RecountCreateRequest,
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Create a new recount request from a rejected count line."""
    try:
        count_line = await db.count_lines.find_one({"id": payload.count_line_id})
        if not count_line:
            raise HTTPException(status_code=404, detail="Count line not found")
        session = await _load_recount_session_or_409(db, count_line.get("session_id"))
        await _enforce_recount_session_logic(
            db=db,
            session=session,
            request=request,
            current_user=current_user,
            operation_name="create_recount_request",
        )

        if count_line.get("status") not in ["rejected", "REJECTED"]:
            raise HTTPException(
                status_code=400, detail="Can only create recount from rejected count line"
            )

        recount_doc = {
            "count_line_id": payload.count_line_id,
            "item_name": count_line.get("item_name", "Unknown"),
            "item_code": count_line.get("item_code"),
            "barcode": count_line.get("barcode"),
            "session_id": count_line.get("session_id"),
            "erp_qty": count_line.get("erp_qty"),
            "counted_qty": count_line.get("counted_qty"),
            "variance": count_line.get("variance"),
            "reason": payload.reason,
            "priority": payload.priority.value,
            "status": RecountStatus.PENDING.value,
            "created_by": current_user["username"],
            "assigned_to": payload.assign_to,
            "notes": payload.notes,
            "due_date": payload.due_date,
            "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "completed_at": None,
            "result_qty": None,
            "recount_iteration": int(count_line.get("recount_iteration", 0) or 0) + 1,
        }

        result = await db.recount_requests.insert_one(recount_doc)
        recount_doc["_id"] = result.inserted_id
        recount_doc["id"] = str(result.inserted_id)

        notification_service = NotificationService(db)
        target_user = payload.assign_to or count_line.get("counted_by")
        if target_user:
            await notification_service.notify_recount_assigned(
                user_id=target_user,
                count_line_id=payload.count_line_id,
                item_name=count_line.get("item_name", "Unknown"),
                reason=payload.reason,
                assigned_by=current_user["username"],
                session_id=count_line.get("session_id"),
                item_code=count_line.get("item_code"),
                barcode=count_line.get("barcode"),
                assigned_to=payload.assign_to,
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
    except Exception as e:
        logger.error("Error creating recount request: %s", _safe_log_value(e))
        _raise_recount_internal_error("Failed to create recount request", e)


@router.get("/list", response_model=dict)
async def list_recount_requests(
    status: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List recount requests with filters."""
    query = {}
    if status:
        query["status"] = status
    if assigned_to:
        query["assigned_to"] = assigned_to
    if priority:
        query["priority"] = priority

    total = await db.recount_requests.count_documents(query)
    cursor = db.recount_requests.find(query).sort("created_at", -1).skip(offset).limit(limit)
    requests = await cursor.to_list(length=limit)

    for req in requests:
        req["_id"] = str(req["_id"])
        req["id"] = req["_id"]

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
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get single recount request details."""
    recount = await db.recount_requests.find_one({"_id": ObjectId(recount_id)})
    if not recount:
        raise HTTPException(status_code=404, detail="Recount request not found")

    recount["_id"] = str(recount["_id"])
    recount["id"] = recount["_id"]

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
        completed_at=recount.get("completed_at").isoformat()
        if recount.get("completed_at")
        else None,
        result_qty=recount.get("result_qty"),
    )


@router.post("/assign")
async def assign_recount_request(
    http_request: Request,
    payload: RecountAssignRequest,
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Assign recount request to a staff member."""
    try:
        recount = await db.recount_requests.find_one({"_id": ObjectId(payload.recount_id)})
        if not recount:
            raise HTTPException(status_code=404, detail="Recount request not found")
        session = await _load_recount_session_or_409(db, recount.get("session_id"))
        await _enforce_recount_session_logic(
            db=db,
            session=session,
            request=http_request,
            current_user=current_user,
            operation_name="assign_recount_request",
        )

        user = await db.users.find_one({"username": payload.assign_to})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        await db.recount_requests.update_one(
            {"_id": ObjectId(payload.recount_id)},
            {
                "$set": {
                    "assigned_to": payload.assign_to,
                    "status": RecountStatus.ASSIGNED.value,
                    "assigned_at": datetime.now(timezone.utc).replace(tzinfo=None),
                    "assigned_by": current_user["username"],
                    "notes": payload.notes or recount.get("notes"),
                    "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            },
        )

        notification_service = NotificationService(db)
        await notification_service.notify_recount_assigned(
            user_id=payload.assign_to,
            count_line_id=recount["count_line_id"],
            item_name=recount["item_name"],
            reason=recount["reason"],
            assigned_by=current_user["username"],
            session_id=recount.get("session_id"),
            item_code=recount.get("item_code"),
            barcode=recount.get("barcode"),
            assigned_to=payload.assign_to,
        )

        return {"success": True, "message": f"Recount assigned to {payload.assign_to}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error assigning recount: %s", _safe_log_value(e))
        _raise_recount_internal_error("Failed to assign recount request", e)


@router.post("/{recount_id}/complete")
async def complete_recount_request(
    recount_id: str,
    http_request: Request,
    payload: RecountUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Complete a recount request with results."""
    try:
        recount = await db.recount_requests.find_one({"_id": ObjectId(recount_id)})
        if not recount:
            raise HTTPException(status_code=404, detail="Recount request not found")
        session = await _load_recount_session_or_409(db, recount.get("session_id"))
        await _enforce_recount_session_logic(
            db=db,
            session=session,
            request=http_request,
            current_user=current_user,
            operation_name="complete_recount_request",
        )

        update_data = {
            "status": RecountStatus.COMPLETED.value,
            "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "completed_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "completed_by": current_user["username"],
        }

        if payload.result_qty is not None:
            update_data["result_qty"] = payload.result_qty

        if payload.notes:
            update_data["completion_notes"] = payload.notes

        await db.recount_requests.update_one({"_id": ObjectId(recount_id)}, {"$set": update_data})

        if payload.result_qty is not None:
            await CountLineWriteService(db).process_write(
                {
                    "operation": "update_one",
                    "filter": {"id": recount["count_line_id"]},
                    "update": {
                        "$set": {
                            "counted_qty": payload.result_qty,
                            "recount_completed_at": datetime.now(timezone.utc).replace(tzinfo=None),
                            "recount_completed_by": current_user["username"],
                        },
                        "$unset": {"recount_requested_at": "", "recount_requested_by": ""},
                    },
                },
                context={
                    "session": session,
                    "variance_reason": payload.notes,
                    "correction_reason": payload.notes,
                    "username": current_user.get("username"),
                },
            )

        notification_service = NotificationService(db)
        await notification_service.create_notification(
            user_id=recount["created_by"],
            notification_type=NotificationType.RECOUNT_COMPLETED,
            title="Recount Completed",
            message=f"Recount for '{recount['item_name']}' has been completed",
            priority=NotificationPriority.MEDIUM,
            action_url=f"/recount/{recount_id}",
            metadata={"recount_id": recount_id, "result_qty": payload.result_qty},
        )

        return {"success": True, "message": "Recount completed", "result_qty": payload.result_qty}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error completing recount: %s", _safe_log_value(e))
        _raise_recount_internal_error("Failed to complete recount request", e)


@router.post("/{recount_id}/cancel")
async def cancel_recount_request(
    recount_id: str,
    request: Request,
    reason: Optional[str] = None,
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Cancel a recount request."""
    try:
        recount = await db.recount_requests.find_one({"_id": ObjectId(recount_id)})
        if not recount:
            raise HTTPException(status_code=404, detail="Recount request not found")
        session = await _load_recount_session_or_409(db, recount.get("session_id"))
        await _enforce_recount_session_logic(
            db=db,
            session=session,
            request=request,
            current_user=current_user,
            operation_name="cancel_recount_request",
        )

        await db.recount_requests.update_one(
            {"_id": ObjectId(recount_id)},
            {
                "$set": {
                    "status": RecountStatus.CANCELLED.value,
                    "cancelled_at": datetime.now(timezone.utc).replace(tzinfo=None),
                    "cancelled_by": current_user["username"],
                    "cancellation_reason": reason or "Cancelled by supervisor",
                    "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            },
        )

        return {"success": True, "message": "Recount cancelled"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error cancelling recount: %s", _safe_log_value(e))
        _raise_recount_internal_error("Failed to cancel recount request", e)


@router.get("/stats/summary")
async def get_recount_summary(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get recount statistics summary."""
    pipeline = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    status_cursor = db.recount_requests.aggregate(pipeline)
    status_counts = await status_cursor.to_list(length=10)

    priority_pipeline = [
        {"$group": {"_id": "$priority", "count": {"$sum": 1}}},
    ]
    priority_cursor = db.recount_requests.aggregate(priority_pipeline)
    priority_counts = await priority_cursor.to_list(length=10)

    total = await db.recount_requests.count_documents({})
    overdue = await db.recount_requests.count_documents(
        {
            "status": {"$nin": [RecountStatus.COMPLETED.value, RecountStatus.CANCELLED.value]},
            "due_date": {"$lt": datetime.now(timezone.utc).replace(tzinfo=None).isoformat()},
        }
    )

    return {
        "success": True,
        "total": total,
        "by_status": {s["_id"]: s["count"] for s in status_counts},
        "by_priority": {p["_id"]: p["count"] for p in priority_counts},
        "overdue": overdue,
    }


@router.get("/staff/{username}/tasks")
async def get_staff_recount_tasks(
    username: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get recount tasks assigned to a staff member."""
    cursor = db.recount_requests.find(
        {
            "assigned_to": username,
            "status": {"$in": [RecountStatus.ASSIGNED.value, RecountStatus.IN_PROGRESS.value]},
        }
    ).sort("created_at", -1)
    tasks = await cursor.to_list(length=50)

    for task in tasks:
        task["_id"] = str(task["_id"])
        task["id"] = task["_id"]

    return {"success": True, "tasks": tasks, "count": len(tasks)}
