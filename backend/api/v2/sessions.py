"""
API v2 Sessions Endpoints
Upgraded session endpoints with standardized responses
"""

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from pymongo.errors import PyMongoError

from backend.api.response_models import ApiResponse, PaginatedResponse
from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.services.ai_variance import ai_variance_service
from backend.services.session_query_service import (
    SessionQueryService,
    get_session_query_service,
)

router = APIRouter()
SESSION_V2_ERRORS = (KeyError, PyMongoError, RuntimeError, TypeError, ValueError)


class SessionResponse(BaseModel):
    """Session response model"""

    id: str
    name: str
    warehouse: str
    status: str
    type: str
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime] = None


def _normalized_datetime_expression(field_name: str) -> dict[str, Any]:
    field_ref = f"${field_name}"
    field_type = {"$type": field_ref}
    return {
        "$switch": {
            "branches": [
                {"case": {"$eq": [field_type, "date"]}, "then": field_ref},
                {
                    "case": {"$eq": [field_type, "string"]},
                    "then": {
                        "$dateFromString": {
                            "dateString": field_ref,
                            "onError": None,
                            "onNull": None,
                        }
                    },
                },
            ],
            "default": None,
        }
    }


def _watchtower_add_fields_stage() -> dict[str, Any]:
    return {
        "$addFields": {
            "counted_at_normalized": _normalized_datetime_expression("counted_at"),
            "counted_qty_normalized": {"$ifNull": ["$counted_qty", "$quantity"]},
        }
    }


def _watchtower_recent_activity_payload(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    payload = []
    for row in rows:
        counted_at = row.get("counted_at_normalized") or row.get("counted_at")
        payload.append(
            {
                "item_code": row.get("item_code"),
                "qty": row.get("counted_qty_normalized"),
                "user": row.get("counted_by", "Unknown"),
                "time": counted_at.isoformat() if isinstance(counted_at, datetime) else counted_at,
            }
        )
    return payload


@router.get("/", response_model=ApiResponse[PaginatedResponse[SessionResponse]])
async def get_sessions_v2(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[str] = Query(None, description="Filter by status"),
    current_user: dict = Depends(get_current_user),
    session_service: SessionQueryService = Depends(get_session_query_service),
):
    """
    Get sessions with pagination (v2)
    Returns standardized paginated response

    Note: Non-supervisor users only see their own sessions.
    """
    try:
        # Build query with user filtering
        query = {}
        if status:
            query["status"] = status

        # Non-supervisor users only see their own sessions
        if current_user.get("role") != "supervisor":
            query["staff_user"] = current_user["username"]

        sessions, total = await session_service.list_sessions_page(
            query, page=page, page_size=page_size
        )

        # Convert to response models
        session_responses = [
            SessionResponse(
                id=str(session["_id"]),
                name=session.get("name", ""),
                warehouse=session.get("warehouse", ""),
                status=session.get("status", "active"),
                type=session.get("type", "STANDARD"),
                created_by=session.get("created_by", ""),
                created_at=session.get(
                    "created_at", datetime.now(timezone.utc).replace(tzinfo=None)
                ),
                updated_at=session.get("updated_at"),
            )
            for session in sessions
        ]

        paginated_response = PaginatedResponse.create(
            items=session_responses,
            total=total,
            page=page,
            page_size=page_size,
        )

        return ApiResponse.success_response(
            data=paginated_response,
            message=f"Retrieved {len(session_responses)} sessions",
        )

    except SESSION_V2_ERRORS as e:
        return ApiResponse.error_response(
            error_code="SESSIONS_FETCH_ERROR",
            error_message=f"Failed to fetch sessions: {str(e)}",
        )


@router.get("/{session_id}/rack-progress", response_model=ApiResponse)
async def get_rack_progress(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    session_service: SessionQueryService = Depends(get_session_query_service),
):
    """
    Get progress percentage for each rack in the session's warehouse.
    """
    try:
        session = await session_service.find_session_by_id_or_session_id(session_id)

        if not session:
            return ApiResponse.error_response(
                error_code="SESSION_NOT_FOUND", error_message="Session not found"
            )

        warehouse = session.get("warehouse")
        if not warehouse:
            return ApiResponse.error_response(
                error_code="INVALID_SESSION",
                error_message="Session has no warehouse assigned",
            )

        rack_progress = await session_service.get_rack_progress(
            warehouse=warehouse, session_id=session_id
        )

        return ApiResponse.success_response(
            data=rack_progress, message="Rack progress calculated successfully"
        )

    except SESSION_V2_ERRORS as e:
        return ApiResponse.error_response(
            error_code="PROGRESS_CALC_ERROR",
            error_message=f"Failed to calculate progress: {str(e)}",
        )


@router.get("/watchtower", response_model=ApiResponse)
async def get_watchtower_stats(
    current_user: dict = Depends(get_current_user),
    session_service: SessionQueryService = Depends(get_session_query_service),
):
    """
    Get real-time statistics for the Watchtower dashboard.
    Returns:
        - Active sessions count
        - Total scans today
        - Active users (last 15 mins)
        - Recent variances
        - Hourly throughput (today)
    """
    try:
        stats = await session_service.get_watchtower_stats(
            add_fields_stage=_watchtower_add_fields_stage(),
            risk_service=ai_variance_service,
        )

        return ApiResponse.success_response(
            data={
                **{key: value for key, value in stats.items() if key != "recent_activity"},
                "recent_activity": _watchtower_recent_activity_payload(stats["recent_activity"]),
            },
            message="Watchtower stats retrieved",
        )

    except SESSION_V2_ERRORS as e:
        return ApiResponse.error_response(
            error_code="WATCHTOWER_ERROR",
            error_message=f"Failed to fetch stats: {str(e)}",
        )
