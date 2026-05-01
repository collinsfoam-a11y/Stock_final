import logging
from datetime import datetime
from typing import Any, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.auth.dependencies import require_admin, require_permissions
from backend.auth.permissions import Permission
from backend.services.logs_service import LogsService, get_logs_service

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Models ---


class ErrorLogModel(BaseModel):
    id: str
    timestamp: datetime
    error_type: str = "UnknownError"
    error_message: str
    error_code: Optional[str] = None
    severity: str = "error"
    endpoint: Optional[str] = None
    method: Optional[str] = None
    user: Optional[str] = None
    role: Optional[str] = None
    ip_address: Optional[str] = None
    resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolution_note: Optional[str] = None
    stack_trace: Optional[str] = None
    stack_trace_preview: Optional[str] = None
    request_data: Optional[dict[str, Optional[Any]]] = None
    context: Optional[dict[str, Optional[Any]]] = None


class ActivityLogModel(BaseModel):
    id: str
    timestamp: datetime
    user: str
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    details: Optional[dict[str, Optional[Any]]] = None
    metadata: Optional[dict[str, Optional[Any]]] = None
    status: str = "success"


# --- Helpers ---


def build_date_query(start_date: Optional[str], end_date: Optional[str]) -> dict[str, Any]:
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
    severity: Optional[str] = None,
    error_type: Optional[str] = None,
    endpoint: Optional[str] = None,
    resolved: Optional[bool] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(require_permissions([Permission.ERROR_LOG_READ])),
    logs_service: LogsService = Depends(get_logs_service),
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

    docs, total = await logs_service.list_error_logs(
        query=query,
        page=page,
        page_size=page_size,
    )
    items = [ErrorLogModel(**doc) for doc in docs]

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
    logs_service: LogsService = Depends(get_logs_service),
):
    """Clear all error logs."""
    await logs_service.delete_error_logs()
    return {"success": True, "message": "All error logs cleared"}


@router.get("/error-logs/stats")
async def get_error_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(require_permissions([Permission.ERROR_LOG_READ])),
    logs_service: LogsService = Depends(get_logs_service),
):
    query: dict[str, Any] = {}
    date_query = build_date_query(start_date, end_date)
    if date_query:
        query["timestamp"] = date_query

    return await logs_service.get_error_stats(query)


@router.get("/error-logs/{log_id}")
async def get_error_detail(
    log_id: str,
    current_user: dict = Depends(require_permissions([Permission.ERROR_LOG_READ])),
    logs_service: LogsService = Depends(get_logs_service),
):
    try:
        doc = await logs_service.get_error_detail(ObjectId(log_id))
    except (InvalidId, TypeError):
        doc = None

    if not doc:
        raise HTTPException(status_code=404, detail="Error log not found")

    return ErrorLogModel(**doc)


@router.put("/error-logs/{log_id}/resolve")
async def resolve_error(
    log_id: str,
    body: dict[str, Any] = Body(...),
    current_user: dict = Depends(require_permissions([Permission.ERROR_LOG_READ])),
    logs_service: LogsService = Depends(get_logs_service),
):
    try:
        oid = ObjectId(log_id)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="Invalid ID")

    resolution_note = body.get("resolution_note", "Resolved manually")

    modified_count = await logs_service.resolve_error(
        log_id=oid,
        resolution_note=resolution_note,
        resolved_by=current_user.get("username"),
    )

    if modified_count == 0:
        raise HTTPException(status_code=404, detail="Log not found")

    return {"success": True, "message": "Error resolved"}


@router.get("/activity-logs")
async def get_activity_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user: Optional[str] = None,
    action: Optional[str] = None,
    status_filter: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(require_permissions([Permission.ACTIVITY_LOG_READ])),
    logs_service: LogsService = Depends(get_logs_service),
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

    docs, total = await logs_service.list_activity_logs(
        query=query,
        page=page,
        page_size=page_size,
    )
    items = [ActivityLogModel(**doc) for doc in docs]

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
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(require_permissions([Permission.ACTIVITY_LOG_READ])),
    logs_service: LogsService = Depends(get_logs_service),
):
    query: dict[str, Any] = {}
    date_query = build_date_query(start_date, end_date)
    if date_query:
        query["timestamp"] = date_query

    return await logs_service.get_activity_stats(query)
