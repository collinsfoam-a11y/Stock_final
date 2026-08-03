import logging
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.auth.dependencies import auth_deps, require_admin, require_permissions
from backend.auth.permissions import Permission

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Models ---


class ErrorLogModel(BaseModel):
    id: str
    timestamp: datetime
    error_type: str = "UnknownError"
    error_message: str
    error_code: str | None = None
    severity: str = "error"
    endpoint: str | None = None
    method: str | None = None
    user: str | None = None
    role: str | None = None
    ip_address: str | None = None
    resolved: bool = False
    resolved_at: datetime | None = None
    resolved_by: str | None = None
    resolution_note: str | None = None
    stack_trace: str | None = None
    stack_trace_preview: str | None = None
    request_data: dict[str, Any | None] | None = None
    context: dict[str, Any | None] | None = None


class ActivityLogModel(BaseModel):
    id: str
    timestamp: datetime
    user: str
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    details: dict[str, Any | None] | None = None
    metadata: dict[str, Any | None] | None = None
    status: str = "success"


# --- Helpers ---


def build_date_query(start_date: str | None, end_date: str | None) -> dict[str, Any]:
    """Build MongoDB date query from ISO strings."""
    date_query: dict[str, Any] = {}
    if start_date:
        try:
            date_query["$gte"] = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        except ValueError:
            pass
    if end_date:
        try:
            date_query["$lte"] = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        except ValueError:
            pass
    return date_query


# --- Endpoints ---


@router.get("/error-logs")
async def get_error_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    severity: str | None = None,
    error_type: str | None = None,
    endpoint: str | None = None,
    resolved: bool | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    current_user: dict = Depends(require_permissions([Permission.ERROR_LOG_READ])),
):
    query: dict[str, Any] = {}
    if severity:
        query["severity"] = severity
    if error_type:
        query["error_type"] = {"$regex": error_type, "$options": "i"}
    if endpoint:
        query["endpoint"] = {"$regex": endpoint, "$options": "i"}
    if resolved is not None:
        query["resolved"] = resolved

    date_query = build_date_query(start_date, end_date)
    if date_query:
        query["timestamp"] = date_query

    total = await auth_deps.db.error_logs.count_documents(query)
    cursor = (
        auth_deps.db.error_logs.find(query)
        .sort("timestamp", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )

    items = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        # Strip full stack traces before returning to clients
        doc.pop("stack_trace", None)
        items.append(ErrorLogModel(**doc))

    return {
        "errors": items,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "has_next": (page * page_size) < total,
        },
    }


@router.delete("/error-logs")
async def delete_error_logs(
    current_user: dict = Depends(require_admin),  # Only admin can clear logs
):
    """Clear all error logs."""
    await auth_deps.db.error_logs.delete_many({})
    return {"success": True, "message": "All error logs cleared"}


@router.get("/error-logs/stats")
async def get_error_stats(
    start_date: str | None = None,
    end_date: str | None = None,
    current_user: dict = Depends(require_permissions([Permission.ERROR_LOG_READ])),
):
    query: dict[str, Any] = {}
    date_query = build_date_query(start_date, end_date)
    if date_query:
        query["timestamp"] = date_query

    total = await auth_deps.db.error_logs.count_documents(query)
    unresolved = await auth_deps.db.error_logs.count_documents({**query, "resolved": False})

    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$severity", "count": {"$sum": 1}}},
    ]
    severity_counts = {}
    async for doc in auth_deps.db.error_logs.aggregate(pipeline):
        severity_counts[doc["_id"]] = doc["count"]

    return {
        "total": total,
        "unresolved": unresolved,
        "by_severity": severity_counts,
        "trend": [],
    }


@router.get("/error-logs/{log_id}")
async def get_error_detail(
    log_id: str,
    current_user: dict = Depends(require_permissions([Permission.ERROR_LOG_READ])),
):
    try:
        doc = await auth_deps.db.error_logs.find_one({"_id": ObjectId(log_id)})
    except (InvalidId, TypeError):
        doc = None

    if not doc:
        raise HTTPException(status_code=404, detail="Error log not found")

    doc["id"] = str(doc.pop("_id"))
    # Strip full stack trace before returning to client
    doc.pop("stack_trace", None)
    return ErrorLogModel(**doc)


@router.put("/error-logs/{log_id}/resolve")
async def resolve_error(
    log_id: str,
    body: dict[str, Any] = Body(...),
    current_user: dict = Depends(require_permissions([Permission.ERROR_LOG_READ])),
):
    try:
        oid = ObjectId(log_id)
    except (InvalidId, TypeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid ID") from exc

    resolution_note = body.get("resolution_note", "Resolved manually")

    result = await auth_deps.db.error_logs.update_one(
        {"_id": oid},
        {
            "$set": {
                "resolved": True,
                "resolved_at": datetime.now(timezone.utc).replace(tzinfo=None),
                "resolved_by": current_user.get("username"),
                "resolution_note": resolution_note,
            }
        },
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Log not found")

    return {"success": True, "message": "Error resolved"}


@router.get("/activity-logs")
async def get_activity_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user: str | None = None,
    action: str | None = None,
    status_filter: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    current_user: dict = Depends(require_permissions([Permission.ACTIVITY_LOG_READ])),
):
    query: dict[str, Any] = {}
    if user:
        query["user"] = {"$regex": user, "$options": "i"}
    if action:
        query["action"] = {"$regex": action, "$options": "i"}
    if status_filter:
        query["status"] = status_filter

    date_query = build_date_query(start_date, end_date)
    if date_query:
        query["timestamp"] = date_query

    total = await auth_deps.db.activity_logs.count_documents(query)
    cursor = (
        auth_deps.db.activity_logs.find(query)
        .sort("timestamp", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )

    items = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        items.append(ActivityLogModel(**doc))

    return {
        "activities": items,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "has_next": (page * page_size) < total,
        },
    }


@router.get("/activity-logs/stats")
async def get_activity_stats(
    start_date: str | None = None,
    end_date: str | None = None,
    current_user: dict = Depends(require_permissions([Permission.ACTIVITY_LOG_READ])),
):
    query: dict[str, Any] = {}
    date_query = build_date_query(start_date, end_date)
    if date_query:
        query["timestamp"] = date_query

    total = await auth_deps.db.activity_logs.count_documents(query)

    pipeline: list[dict[str, Any]] = [
        {"$match": query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    status_counts: dict[str, int] = {}
    async for doc in auth_deps.db.activity_logs.aggregate(pipeline):
        status_counts[doc["_id"]] = doc["count"]

    return {"total": total, "by_status": status_counts, "trend": []}
