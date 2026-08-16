"""
Admin Dashboard API - Live KPIs, System Status, User Monitoring
PC-based web dashboard endpoints for administrators
"""

import asyncio
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import psutil
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from backend.auth.dependencies import require_admin
from backend.db.runtime import get_db
from backend.utils.api_utils import sanitize_for_logging

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
    uptime_seconds: float
    timestamp: str


class ActiveUserInfo(BaseModel):
    user_id: str
    username: str
    role: str
    last_activity: str
    current_session: str | None = None
    status: str  # online, idle


class ErrorLogEntry(BaseModel):
    id: str
    timestamp: str
    level: str
    message: str
    endpoint: str | None = None
    user_id: str | None = None
    details: dict[str, Any] | None = None


class PerformanceMetric(BaseModel):
    timestamp: str
    latency_ms: float
    throughput_rps: float
    error_count: int


# Helper Functions
async def calculate_total_stock_value(db) -> float:
    """Calculate total value of all stock items."""
    try:
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "total_value": {
                        "$sum": {"$multiply": ["$stock_qty", {"$ifNull": ["$price", 0]}]}
                    },
                }
            },
        ]
        result = await db.erp_items.aggregate(pipeline).to_list(1)
        return result[0]["total_value"] if result else 0.0
    except Exception as e:
        logger.error("Error calculating total stock value: %s", sanitize_for_logging(str(e)))
        return 0.0


async def calculate_verified_value(db) -> float:
    """Calculate value of verified stock."""
    try:
        total_value = 0.0
        # Iterate to multiply verified count * standard cost
        async for line in db.count_lines.find({"status": "verified"}):
            qty = float(line.get("counted_qty", 0))
            # need a lookup to erp_items for price, or assume it's synced.
            # We'll assume a denormalized unit_value for performance
            unit_value = float(line.get("unit_value", 0))
            total_value += qty * unit_value
        return total_value
    except Exception as e:
        logger.error("Error calculating verified value: %s", sanitize_for_logging(str(e)))
        return 0.0


async def calculate_completion_percentage(db) -> float:
    """Calculate percentage of items verified out of total."""
    try:
        total_items = await db.erp_items.count_documents({})
        if total_items == 0:
            return 0.0

        # Unique verified items. A single item might be verified across multiple sessions/locations.
        verified_items_result = await db.count_lines.aggregate(
            [
                {"$match": {"status": "locked", "item_code": {"$exists": True, "$ne": ""}}},
                {"$group": {"_id": "$item_code"}},
                {"$count": "count"},
            ]
        ).to_list(1)
        verified_items = verified_items_result[0]["count"] if verified_items_result else 0
        return round((verified_items / total_items) * 100, 2)
    except Exception as e:
        logger.error("Error calculating completion: %s", sanitize_for_logging(str(e)))
        return 0.0


async def count_active_sessions(db) -> int:
    """Count currently active verification sessions."""
    try:
        return await db.verification_sessions.count_documents(
            {"status": {"$in": ["OPEN", "ACTIVE", "RECONCILE", "active", "in_progress"]}}
        )
    except Exception as e:
        logger.error("Error counting sessions: %s", sanitize_for_logging(str(e)))
        return 0


async def count_active_users(db) -> int:
    """Count users active in the last 30 minutes."""
    try:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=30)
        return await db.user_presence.count_documents({"last_seen": {"$gte": cutoff}})
    except Exception as e:
        logger.error("Error counting active users: %s", sanitize_for_logging(str(e)))
        return 0


async def count_pending_variances(db) -> int:
    """Count variances needing supervisor approval."""
    try:
        return await db.count_lines.count_documents(
            {
                "variance": {"$exists": True, "$ne": 0},
                "$or": [
                    {"status": {"$in": ["pending_approval", "NEEDS_REVIEW"]}},
                    {"approval_status": "NEEDS_REVIEW"},
                ],
            }
        )
    except Exception as e:
        logger.error("Error counting variances: %s", sanitize_for_logging(str(e)))
        return 0


async def count_items_verified_today(db) -> int:
    """Count number of count_lines submitted today."""
    try:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        return await db.count_lines.count_documents(
            {
                "timestamp": {"$gte": today_start.isoformat()},
                "status": {"$in": ["verified", "locked", "approved"]},
            }
        )
    except Exception as e:
        logger.error("Error counting today's verifications: %s", sanitize_for_logging(str(e)))
        return 0


async def check_mongodb_connection(db) -> str:
    """Check MongoDB connection status."""
    try:
        await db.command("ping")
        return "connected"
    except Exception as e:
        logger.error("MongoDB connection error: %s", sanitize_for_logging(str(e)))
        return "disconnected"


async def check_sqlserver_connection() -> str:
    """Check SQL Server connection status."""
    from backend.utils.db_connection import SQLServerConnectionBuilder

    try:
        # Avoid creating a full connection pool for health check, just a quick ping
        conn_str = SQLServerConnectionBuilder.build_connection_string()
        if SQLServerConnectionBuilder.test_connection(conn_str):
            return "connected"
        return "disconnected"
    except Exception as e:
        logger.error("SQL Server connection error: %s", sanitize_for_logging(str(e)))
        return "disconnected"


def get_memory_usage() -> float:
    """Get process memory usage in MB."""
    try:
        process = psutil.Process(os.getpid())
        return round(process.memory_info().rss / 1024 / 1024, 2)
    except Exception:
        return 0.0


def get_cpu_usage() -> float:
    """Get process CPU usage percentage."""
    try:
        return psutil.cpu_percent(interval=0.1)
    except Exception:
        return 0.0


def get_uptime() -> float:
    """Get server uptime in seconds."""
    return round(time.time() - SERVER_START_TIME, 2)


@admin_dashboard_router.get("/kpis", response_model=KPIResponse)
async def get_dashboard_kpis(current_user: dict = Depends(require_admin)):
    """
    Get live KPIs for admin dashboard.
    Includes total stock value, verified value, completion percentage, etc.
    """
    db = get_db()

    (
        total_stock_value,
        verified_stock_value,
        verification_percentage,
        active_sessions,
        active_users,
        pending_variances,
        items_verified_today,
    ) = await asyncio.gather(
        calculate_total_stock_value(db),
        calculate_verified_value(db),
        calculate_completion_percentage(db),
        count_active_sessions(db),
        count_active_users(db),
        count_pending_variances(db),
        count_items_verified_today(db),
    )

    return KPIResponse(
        total_stock_value=total_stock_value,
        verified_stock_value=verified_stock_value,
        verification_percentage=verification_percentage,
        active_sessions=active_sessions,
        active_users=active_users,
        pending_variances=pending_variances,
        items_verified_today=items_verified_today,
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    )


@admin_dashboard_router.get("/system-status", response_model=SystemStatusResponse)
async def get_system_status(current_user: dict = Depends(require_admin)):
    """
    Get real-time system health metrics.
    Includes database connections, performance metrics, and resource usage.
    """
    db = get_db()

    # Get average response time from metrics collection
    avg_response_time = 0.0
    error_rate = 0.0
    try:
        # Look at last 100 API metrics
        pipeline: list[dict[str, Any]] = [
            {"$sort": {"timestamp": -1}},
            {"$limit": 100},
            {
                "$group": {
                    "_id": None,
                    "avg_latency": {"$avg": "$latency_ms"},
                    "total_requests": {"$sum": 1},
                    "error_count": {"$sum": {"$cond": [{"$gte": ["$status_code", 400]}, 1, 0]}},
                }
            },
        ]
        result = await db.api_metrics.aggregate(pipeline).to_list(1)
        if result:
            avg_response_time = round(result[0].get("avg_latency", 0), 2)
            total = result[0].get("total_requests", 1)
            errors = result[0].get("error_count", 0)
            error_rate = round((errors / total) * 100, 2) if total > 0 else 0.0
    except Exception as e:
        logger.warning("Could not fetch API metrics: %s", sanitize_for_logging(str(e)))

    return SystemStatusResponse(
        api_health="healthy",
        mongodb_status=await check_mongodb_connection(db),
        sqlserver_status=await check_sqlserver_connection(),
        avg_response_time_ms=avg_response_time,
        error_rate_percent=error_rate,
        memory_usage_mb=get_memory_usage(),
        cpu_usage_percent=get_cpu_usage(),
        uptime_seconds=get_uptime(),
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    )


@admin_dashboard_router.get("/active-users", response_model=list[ActiveUserInfo])
async def get_active_users(current_user: dict = Depends(require_admin)):
    """
    Get list of currently active users with their status and session info.
    """
    db = get_db()

    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=30)

    try:
        # Get recent user presence records
        cursor = db.user_presence.find({"last_seen": {"$gte": cutoff}}).sort("last_seen", -1)

        presence_records = await cursor.to_list(100)

        user_ids = [record.get("user_id") for record in presence_records if record.get("user_id")]

        # ⚡ Bolt: Bulk fetch users to avoid N+1 queries
        users_cursor = db.users.find({"_id": {"$in": user_ids}})
        users_list = await users_cursor.to_list(None)
        users_dict = {user["_id"]: user for user in users_list}

        # ⚡ Bolt: Bulk fetch sessions to avoid N+1 queries
        # Cast _id to string for session lookup if needed, but keeping str(user_id) to match existing logic
        string_user_ids = [str(uid) for uid in user_ids]
        sessions_cursor = db.verification_sessions.find(
            {
                "user_id": {"$in": string_user_ids},
                "status": {"$in": ["OPEN", "ACTIVE", "RECONCILE", "active", "in_progress"]},
            }
        )
        sessions_list = await sessions_cursor.to_list(None)
        sessions_dict = {session["user_id"]: session for session in sessions_list}

        active_users = []
        for record in presence_records:
            user_id = record.get("user_id")
            if not user_id:
                continue

            # Get user details from pre-fetched dictionary
            user = users_dict.get(user_id)
            if user:
                # Check if user has an active session from pre-fetched dictionary
                session = sessions_dict.get(str(user["_id"]))

                # Determine online status
                last_seen = record.get("last_seen", datetime.now(timezone.utc).replace(tzinfo=None))
                minutes_ago = (
                    datetime.now(timezone.utc).replace(tzinfo=None) - last_seen
                ).total_seconds() / 60
                user_status = "online" if minutes_ago < 5 else "idle"

                active_users.append(
                    ActiveUserInfo(
                        user_id=str(user["_id"]),
                        username=user.get("username", "Unknown"),
                        role=user.get("role", "staff"),
                        last_activity=last_seen.isoformat(),
                        current_session=session.get("id") if session else None,
                        status=user_status,
                    )
                )

        return active_users

    except Exception as e:
        logger.error("Error fetching active users: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch active users",
        ) from e


@admin_dashboard_router.get("/error-logs", response_model=list[ErrorLogEntry])
async def get_error_logs(
    limit: int = Query(default=100, le=500),
    level: str | None = Query(default=None, pattern="^(error|warning|critical)$"),
    hours: int = Query(default=24, le=168),
    current_user: dict = Depends(require_admin),
):
    """
    Get recent API errors from the error log.
    """
    db = get_db()

    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)

    query: dict[str, Any] = {"timestamp": {"$gte": cutoff}}
    if level:
        query["level"] = level.upper()

    try:
        cursor = db.error_logs.find(query).sort("timestamp", -1).limit(limit)
        logs = await cursor.to_list(limit)

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

    except Exception as e:
        logger.error("Error fetching error logs: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch error logs",
        ) from e


@admin_dashboard_router.get("/performance-metrics", response_model=list[PerformanceMetric])
async def get_performance_metrics(
    hours: int = Query(default=24, le=168),
    interval_minutes: int = Query(default=60, le=360),
    current_user: dict = Depends(require_admin),
):
    """
    Get performance metrics aggregated by time interval.
    Used for charts showing latency, throughput, and error rates over time.
    """
    db = get_db()

    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)

    try:
        # Aggregate metrics by time bucket
        pipeline: list[dict[str, Any]] = [
            {"$match": {"timestamp": {"$gte": cutoff}}},
            {
                "$group": {
                    "_id": {
                        "$dateTrunc": {
                            "date": "$timestamp",
                            "unit": "minute",
                            "binSize": interval_minutes,
                        }
                    },
                    "avg_latency": {"$avg": "$latency_ms"},
                    "request_count": {"$sum": 1},
                    "error_count": {"$sum": {"$cond": [{"$gte": ["$status_code", 400]}, 1, 0]}},
                }
            },
            {"$sort": {"_id": 1}},
        ]

        results = await db.api_metrics.aggregate(pipeline).to_list(1000)

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

    except Exception as e:
        logger.error("Error fetching performance metrics: %s", sanitize_for_logging(str(e)))
        # Return empty list on error rather than failing
        return []


@admin_dashboard_router.get("/summary")
async def get_dashboard_summary(current_user: dict = Depends(require_admin)):
    """
    Get a complete dashboard summary combining KPIs, system status, and recent activity.
    Single endpoint for initial dashboard load.
    """
    db = get_db()

    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)

    # Parallel fetch of all dashboard data
    kpis, system_status, active_users, recent_errors = await asyncio.gather(
        get_dashboard_kpis(current_user),
        get_system_status(current_user),
        get_active_users(current_user),
        db.error_logs.count_documents(
            {"timestamp": {"$gte": cutoff}, "level": {"$in": ["ERROR", "CRITICAL"]}}
        ),
    )

    return {
        "kpis": kpis.model_dump(),
        "system_status": system_status.model_dump(),
        "active_users": [u.model_dump() for u in active_users[:10]],
        "recent_errors_1h": recent_errors,
        "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    }
