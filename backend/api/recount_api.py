"""
Recount Request API - Enhanced recount workflow with notifications and staff assignment
"""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.auth.dependencies import get_current_user
from backend.auth.permissions import Permission, require_permission
from backend.db.runtime import get_db
from backend.services.notification_service import (
    NotificationPriority,
    NotificationService,
    NotificationType,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/recount", tags=["Recount"])


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
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Create a new recount request from a rejected count line."""
    try:
        count_line = await db.count_lines.find_one({"id": request.count_line_id})
        if not count_line:
            raise HTTPException(status_code=404, detail="Count line not found")

        if count_line.get("status") not in ["rejected", "REJECTED"]:
            raise HTTPException(
                status_code=400, detail="Can only create recount from rejected count line"
            )

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
        target_user = request.assign_to or count_line.get("counted_by")
        if target_user:
            await notification_service.notify_recount_assigned(
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
    except Exception as e:
        logger.error(f"Error creating recount request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
    request: RecountAssignRequest,
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Assign recount request to a staff member."""
    try:
        recount = await db.recount_requests.find_one({"_id": ObjectId(request.recount_id)})
        if not recount:
            raise HTTPException(status_code=404, detail="Recount request not found")

        user = await db.users.find_one({"username": request.assign_to})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        await db.recount_requests.update_one(
            {"_id": ObjectId(request.recount_id)},
            {
                "$set": {
                    "assigned_to": request.assign_to,
                    "status": RecountStatus.ASSIGNED.value,
                    "assigned_at": datetime.now(timezone.utc).replace(tzinfo=None),
                    "assigned_by": current_user["username"],
                    "notes": request.notes or recount.get("notes"),
                    "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            },
        )

        notification_service = NotificationService(db)
        await notification_service.notify_recount_assigned(
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
    except Exception as e:
        logger.error(f"Error assigning recount: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{recount_id}/complete")
async def complete_recount_request(
    recount_id: str,
    request: RecountUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Complete a recount request with results."""
    try:
        recount = await db.recount_requests.find_one({"_id": ObjectId(recount_id)})
        if not recount:
            raise HTTPException(status_code=404, detail="Recount request not found")

        update_data = {
            "status": RecountStatus.COMPLETED.value,
            "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "completed_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "completed_by": current_user["username"],
        }

        if request.result_qty is not None:
            update_data["result_qty"] = request.result_qty

        if request.notes:
            update_data["completion_notes"] = request.notes

        await db.recount_requests.update_one({"_id": ObjectId(recount_id)}, {"$set": update_data})

        if request.result_qty is not None:
            await db.count_lines.update_one(
                {"id": recount["count_line_id"]},
                {
                    "$set": {
                        "counted_qty": request.result_qty,
                        "recount_completed_at": datetime.now(timezone.utc).replace(tzinfo=None),
                        "recount_completed_by": current_user["username"],
                    },
                    "$unset": {"recount_requested_at": "", "recount_requested_by": ""},
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
            metadata={"recount_id": recount_id, "result_qty": request.result_qty},
        )

        return {"success": True, "message": "Recount completed", "result_qty": request.result_qty}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing recount: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{recount_id}/cancel")
async def cancel_recount_request(
    recount_id: str,
    reason: Optional[str] = None,
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Cancel a recount request."""
    try:
        recount = await db.recount_requests.find_one({"_id": ObjectId(recount_id)})
        if not recount:
            raise HTTPException(status_code=404, detail="Recount request not found")

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
        logger.error(f"Error cancelling recount: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
