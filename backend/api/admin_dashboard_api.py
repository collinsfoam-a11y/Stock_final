"""
Admin Dashboard API - Live KPIs, System Status, User Monitoring
PC-based web dashboard endpoints for administrators
"""

import logging
from backend.utils.api_utils import sanitize_for_logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Optional

import psutil
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from backend.auth.dependencies import require_admin
from backend.config import settings
from backend.services.admin_dashboard_service import (
    DASHBOARD_ERROR_TYPES,
    AdminDashboardService,
    get_admin_dashboard_service,
)
from backend.services.sql_health import check_sql_server_connection_status
from backend.utils.request_context import get_request_id

logger = logging.getLogger(__name__)

admin_dashboard_router = APIRouter(prefix="/admin/dashboard", tags=["Admin Dashboard"])

# Track server start time for uptime calculation
SERVER_START_TIME = time.time()


# Response Models
class KPIResponse(BaseModel):
    total_stock_value: float
    verified_stock_value: float
    verification_percentage: float
    active_sessions: int
    active_users: int
    pending_variances: int
    items_verified_today: int
    timestamp: str


class SystemStatusResponse(BaseModel):
    api_health: str
    mongodb_status: str
    sqlserver_status: str
    avg_response_time_ms: float
    error_rate_percent: float
    memory_usage_mb: float
    cpu_usage_percent: float
    uptime_seconds: int
    timestamp: str


class ActiveUserInfo(BaseModel):
    user_id: str
    username: str
    role: str
    last_activity: str
    current_session: Optional[str]
    status: str


class ErrorLogEntry(BaseModel):
    id: str
    timestamp: str
    level: str
    message: str
    endpoint: Optional[str]
    user_id: Optional[str]
    details: dict[str, Optional[Any]]


class PerformanceMetric(BaseModel):
    timestamp: str
    latency_ms: float
    throughput_rps: float
    error_count: int


# Helper Functions
async def calculate_total_stock_value(db) -> float:
    """Calculate total stock value from ERP items."""
    return await AdminDashboardService(db).calculate_total_stock_value()


async def calculate_verified_value(db) -> float:
    """Calculate value of verified stock."""
    return await AdminDashboardService(db).calculate_verified_value()


async def calculate_completion_percentage(db) -> float:
    """Calculate verification completion percentage."""
    return await AdminDashboardService(db).calculate_completion_percentage()


async def count_active_sessions(db) -> int:
    """Count currently active verification sessions."""
    return await AdminDashboardService(db).count_active_sessions()


async def count_active_users(db) -> int:
    """Count users with recent activity (last 30 minutes)."""
    return await AdminDashboardService(db).count_active_users()


async def count_pending_variances(db) -> int:
    """Count variances pending supervisor review."""
    return await AdminDashboardService(db).count_pending_variances()


async def count_items_verified_today(db) -> int:
    """Count items verified today."""
    return await AdminDashboardService(db).count_items_verified_today()


async def check_mongodb_connection(db) -> str:
    """Check MongoDB connection status."""
    return await AdminDashboardService(db).check_mongodb_connection()


async def check_sqlserver_connection() -> str:
    """Check SQL Server connection status."""
    return await check_sql_server_connection_status()


def get_memory_usage() -> float:
    """Get current memory usage in MB."""
    try:
        process = psutil.Process(os.getpid())
        return round(process.memory_info().rss / 1024 / 1024, 2)
    except DASHBOARD_ERROR_TYPES:
        return 0.0


def get_cpu_usage() -> float:
    """Get current CPU usage percentage."""
    try:
        return psutil.cpu_percent(interval=0.1)
    except DASHBOARD_ERROR_TYPES:
        return 0.0


def get_uptime() -> int:
    """Get server uptime in seconds."""
    return int(time.time() - SERVER_START_TIME)


# API Endpoints
@admin_dashboard_router.get("/kpis", response_model=KPIResponse)
async def get_dashboard_kpis(current_user: dict = Depends(require_admin)):
    """
    Get live KPIs for admin dashboard.
    Includes total stock value, verified value, completion percentage, etc.
    """
    dashboard_service = get_admin_dashboard_service()

    if settings.V3_PROJECTION_DASHBOARD_READS:
        return KPIResponse(
            **await dashboard_service.get_projection_admin_kpis(
                active_users=await dashboard_service.count_active_users()
            )
        )

    return KPIResponse(
        total_stock_value=await dashboard_service.calculate_total_stock_value(),
        verified_stock_value=await dashboard_service.calculate_verified_value(),
        verification_percentage=await dashboard_service.calculate_completion_percentage(),
        active_sessions=await dashboard_service.count_active_sessions(),
        active_users=await dashboard_service.count_active_users(),
        pending_variances=await dashboard_service.count_pending_variances(),
        items_verified_today=await dashboard_service.count_items_verified_today(),
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    )


@admin_dashboard_router.get("/system-status", response_model=SystemStatusResponse)
async def get_system_status(
    http_request: Request,
    current_user: dict = Depends(require_admin),
):
    """
    Get real-time system health metrics.
    Includes database connections, performance metrics, and resource usage.
    """
    dashboard_service = get_admin_dashboard_service()
    request_id = get_request_id(http_request.headers)

    # Get average response time from metrics collection
    avg_response_time, error_rate = await dashboard_service.get_api_metrics_summary()

    response = SystemStatusResponse(
        api_health="healthy",
        mongodb_status=await dashboard_service.check_mongodb_connection(),
        sqlserver_status=await check_sqlserver_connection(),
        avg_response_time_ms=avg_response_time,
        error_rate_percent=error_rate,
        memory_usage_mb=get_memory_usage(),
        cpu_usage_percent=get_cpu_usage(),
        uptime_seconds=get_uptime(),
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    )
    logger.info(
        "admin_system_status_checked",
        extra={
            "request_id": request_id,
            "user": sanitize_for_logging(str(current_user.get("username", "unknown"))),
            "endpoint": "/admin/dashboard/system-status",
            "status": "completed",
        },
    )
    return response


@admin_dashboard_router.get("/active-users", response_model=list[ActiveUserInfo])
async def get_active_users(current_user: dict = Depends(require_admin)):
    """
    Get list of currently active users with their status and session info.
    """
    try:
        return [
            ActiveUserInfo(**user)
            for user in await get_admin_dashboard_service().get_active_users()
        ]

    except DASHBOARD_ERROR_TYPES as e:
        logger.error("Error fetching active users: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch active users",
        )


@admin_dashboard_router.get("/error-logs", response_model=list[ErrorLogEntry])
async def get_error_logs(
    limit: int = Query(default=100, le=500),
    level: Optional[str] = Query(default=None, pattern="^(error|warning|critical)$"),
    hours: int = Query(default=24, le=168),
    current_user: dict = Depends(require_admin),
):
    """
    Get recent API errors from the error log.
    """
    try:
        logs = await get_admin_dashboard_service().get_error_logs(
            level=level,
            hours=hours,
            limit=limit,
        )

        return [
            ErrorLogEntry(
                id=str(log.get("_id", "")),
                timestamp=log.get(
                    "timestamp", datetime.now(timezone.utc).replace(tzinfo=None)
                ).isoformat(),
                level=log.get("level", "ERROR"),
                message=log.get("message", "Unknown error"),
                endpoint=log.get("endpoint"),
                user_id=log.get("user_id"),
                details=log.get("details"),
            )
            for log in logs
        ]

    except DASHBOARD_ERROR_TYPES as e:
        logger.error("Error fetching error logs: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch error logs",
        )


@admin_dashboard_router.get(
    "/performance-metrics", response_model=list[PerformanceMetric]
)
async def get_performance_metrics(
    hours: int = Query(default=24, le=168),
    interval_minutes: int = Query(default=60, le=360),
    current_user: dict = Depends(require_admin),
):
    """
    Get performance metrics aggregated by time interval.
    Used for charts showing latency, throughput, and error rates over time.
    """
    try:
        results = await get_admin_dashboard_service().get_performance_metrics(
            hours=hours,
            interval_minutes=interval_minutes,
        )

        metrics = []
        for r in results:
            bucket_time = r["_id"]
            request_count = r["request_count"]
            interval_seconds = interval_minutes * 60
            throughput = request_count / interval_seconds if interval_seconds > 0 else 0

            metrics.append(
                PerformanceMetric(
                    timestamp=(
                        bucket_time.isoformat()
                        if bucket_time
                        else datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
                    ),
                    latency_ms=round(r.get("avg_latency", 0), 2),
                    throughput_rps=round(throughput, 3),
                    error_count=r.get("error_count", 0),
                )
            )

        return metrics

    except DASHBOARD_ERROR_TYPES as e:
        logger.error(
            "Error fetching performance metrics: %s", sanitize_for_logging(str(e))
        )
        # Return empty list on error rather than failing
        return []


@admin_dashboard_router.get("/summary")
async def get_dashboard_summary(current_user: dict = Depends(require_admin)):
    """
    Get a complete dashboard summary combining KPIs, system status, and recent activity.
    Single endpoint for initial dashboard load.
    """
    dashboard_service = get_admin_dashboard_service()

    # Parallel fetch of all dashboard data
    kpis = await get_dashboard_kpis(current_user)
    avg_response_time, error_rate = await dashboard_service.get_api_metrics_summary()
    system_status = SystemStatusResponse(
        api_health="healthy",
        mongodb_status=await dashboard_service.check_mongodb_connection(),
        sqlserver_status=await check_sqlserver_connection(),
        avg_response_time_ms=avg_response_time,
        error_rate_percent=error_rate,
        memory_usage_mb=get_memory_usage(),
        cpu_usage_percent=get_cpu_usage(),
        uptime_seconds=get_uptime(),
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    )
    active_users = await get_active_users(current_user)

    # Get recent error count
    recent_errors = await dashboard_service.count_recent_errors(hours=1)

    return {
        "kpis": kpis.model_dump(),
        "system_status": system_status.model_dump(),
        "active_users": [u.model_dump() for u in active_users[:10]],
        "recent_errors_1h": recent_errors,
        "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    }
