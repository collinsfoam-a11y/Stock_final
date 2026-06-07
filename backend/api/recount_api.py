"""
Recount Request API - Enhanced recount workflow with notifications and staff assignment
"""

import logging
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.auth.dependencies import get_current_user
from backend.auth.permissions import Permission, require_permission
from backend.db.runtime import get_db
from backend.services.count_line_write_service import CountLineWriteService
from backend.services.governance_guard import GovernanceViolation
from backend.services.notification_service import (
    NotificationPriority,
    NotificationService,
    NotificationType,
)
from backend.services.session_lifecycle_service import SessionLifecycleService
from backend.services.transaction_manager import mongo_transaction
from backend.utils.api_utils import sanitize_for_logging

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
            "blind_recount_required": True,
            "dual_verification_required": True,
            "original_counter": count_line.get("counted_by") or count_line.get("created_by"),
        }
        lifecycle_service = SessionLifecycleService(db)
        recount_doc = await lifecycle_service.create_recount_request(
            recount_doc=recount_doc,
            actor=current_user["username"],
        )
        recount_doc["id"] = str(recount_doc.get("_id") or recount_doc.get("id") or "")

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
    except GovernanceViolation as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except Exception as e:
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
    lifecycle_service = SessionLifecycleService(db)
    recount = await lifecycle_service.get_recount_request(recount_id)
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
            recount["completed_at"].isoformat()
            if isinstance(recount.get("completed_at"), datetime)
            else None
        ),
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
        lifecycle_service = SessionLifecycleService(db)
        recount = await lifecycle_service.get_recount_request(request.recount_id)
        if not recount:
            raise HTTPException(status_code=404, detail="Recount request not found")

        user = await db.users.find_one({"username": request.assign_to})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
        await lifecycle_service.transition_recount_request(
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
    except GovernanceViolation as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except Exception as e:
        logger.error("Error assigning recount: %s", sanitize_for_logging(str(e)))
        raise HTTPException(status_code=500, detail=str(e))



async def _process_recount_result_tx(
    db,
    tx,
    lifecycle_service,
    recount_id,
    request,
    username,
    is_privileged,
    now_dt,
    update_data,
):
    recount = await lifecycle_service.get_recount_request(recount_id, db_session=tx)
    if not recount:
        raise HTTPException(status_code=404, detail="Recount request not found")

    existing_line = await db.count_lines.find_one(
        {"id": recount["count_line_id"]},
        session=tx,
    )
    if not existing_line:
        raise HTTPException(status_code=404, detail="Count line for recount not found")
    original_counter = str(
        recount.get("original_counter")
        or existing_line.get("counted_by")
        or existing_line.get("created_by")
        or ""
    ).strip()
    if (
        recount.get("blind_recount_required")
        and not is_privileged
        and original_counter
        and original_counter == username
    ):
        raise HTTPException(
            status_code=403,
            detail="Blind recount requires a different staff user than the original count",
        )

    session_id = str(existing_line.get("session_id") or recount.get("session_id") or "")
    session = await lifecycle_service.ensure_session_active(session_id, db_session=tx)

    location_id = str(
        existing_line.get("location_id")
        or session.get("location_id")
        or session.get("warehouse")
        or ""
    ).strip()
    floor_id = str(
        existing_line.get("floor_id")
        or existing_line.get("floor_no")
        or session.get("floor_id")
        or ""
    ).strip()
    rack_id = str(
        existing_line.get("rack_id")
        or existing_line.get("rack_no")
        or session.get("rack_no")
        or ""
    ).strip()
    if not location_id or not floor_id or not rack_id:
        raise HTTPException(
            status_code=400,
            detail="CRITICAL: Recount requires location_id, floor_id and rack_id context",
        )

    previous_line_id = str(existing_line.get("id") or existing_line.get("_id"))
    new_line = dict(existing_line)
    new_line.pop("_id", None)
    new_line["id"] = str(uuid.uuid4())
    new_line["counted_qty"] = request.result_qty
    new_line["status"] = "pending"
    new_line["approval_status"] = "PENDING"
    new_line["verified"] = False
    new_line["verified_by"] = None
    new_line["verified_at"] = None
    new_line["rejected_by"] = None
    new_line["rejected_at"] = None
    new_line["recount_requested_at"] = None
    new_line["recount_requested_by"] = None
    new_line["recount_completed_at"] = now_dt
    new_line["recount_completed_by"] = username
    new_line["updated_at"] = now_dt
    new_line["updated_by"] = username
    new_line["location_id"] = location_id
    new_line["floor_id"] = floor_id
    new_line["rack_id"] = rack_id
    new_line.setdefault("floor_no", floor_id)
    new_line.setdefault("rack_no", rack_id)
    new_line["version"] = int(existing_line.get("version", 1) or 1) + 1
    new_line["previous_version_id"] = previous_line_id
    new_line["recount_of_id"] = (
        existing_line.get("recount_of_id")
        or existing_line.get("id")
        or previous_line_id
    )
    new_line["recount_iteration"] = (
        int(existing_line.get("recount_iteration", 0) or 0) + 1
    )
    new_line["blind_recount_completed_by_distinct_user"] = original_counter != username
    new_line["dual_verification_required"] = True

    write_service = CountLineWriteService(db)
    tx_context = {
        "session": session,
        "username": username,
        "db_session": tx,
    }
    await write_service.process_write(
        {"operation": "insert_one", "document": new_line},
        context={**tx_context, "skip_session_totals_update": True},
    )
    await write_service.process_write(
        {
            "operation": "update_one",
            "filter": {"_id": existing_line["_id"]},
            "update": {
                "$set": {
                    "status": "SUPERSEDED",
                    "superseded_at": now_dt,
                    "superseded_by": username,
                    "superseded_by_version_id": new_line["id"],
                    "location_id": location_id,
                    "floor_id": floor_id,
                    "rack_id": rack_id,
                }
            },
        },
        context=tx_context,
    )

    await lifecycle_service.transition_recount_request(
        recount_id=recount_id,
        target_status=RecountStatus.COMPLETED.value,
        actor=username,
        fields=update_data,
        db_session=tx,
    )


@router.post("/{recount_id}/complete")
async def complete_recount_request(
    recount_id: str,
    request: RecountUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Complete a recount request with results."""
    try:
        lifecycle_service = SessionLifecycleService(db)
        recount = await lifecycle_service.get_recount_request(recount_id)
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
            await lifecycle_service.transition_recount_request(
                recount_id=recount_id,
                target_status=RecountStatus.COMPLETED.value,
                actor=username,
                fields=update_data,
            )
        else:
            update_data["result_qty"] = request.result_qty
            async with mongo_transaction(db.client) as tx:
                await _process_recount_result_tx(
                    db,
                    tx,
                    lifecycle_service,
                    recount_id,
                    request,
                    username,
                    is_privileged,
                    now_dt,
                    update_data,
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
    except GovernanceViolation as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except Exception as e:
        logger.error("Error completing recount: %s", sanitize_for_logging(str(e)))
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
        lifecycle_service = SessionLifecycleService(db)
        recount = await lifecycle_service.get_recount_request(recount_id)
        if not recount:
            raise HTTPException(status_code=404, detail="Recount request not found")

        now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
        await lifecycle_service.transition_recount_request(
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
    except Exception as e:
        logger.error("Error cancelling recount: %s", sanitize_for_logging(str(e)))
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
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    overdue = await db.recount_requests.count_documents(
        {
            "status": {"$nin": [RecountStatus.COMPLETED.value, RecountStatus.CANCELLED.value]},
            "$or": [
                # Stored as datetime (preferred path)
                {"due_date": {"$lt": now_utc, "$type": "date"}},
                # Stored as ISO string (legacy path) — string ordering is valid for ISO-8601
                {"due_date": {"$lt": now_utc.isoformat(), "$type": "string"}},
            ],
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
