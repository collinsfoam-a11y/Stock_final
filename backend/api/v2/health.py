"""
API v2 Health Endpoints
Enhanced health check endpoints with detailed service status
"""

import asyncio
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends

from backend.api.response_models import ApiResponse, HealthCheckResponse
from backend.auth.dependencies import get_current_user_async as get_current_user

router = APIRouter()


async def _safe_service_check(obj: Any, method: str) -> dict[str, Any]:
    """Safely call a service check method (handles both sync and async)."""
    if not obj:
        return {"status": "not_configured"}
    if not hasattr(obj, method):
        return {"status": "unknown"}
    try:
        res = getattr(obj, method)()
        if asyncio.iscoroutine(res):
            return await res
        return res
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


async def _check_mongodb(database_health_service: Any) -> dict[str, Any]:
    """Check MongoDB health."""
    result = await _safe_service_check(database_health_service, "check_mongo_health")
    # Result from database_health_service.check_mongo_health already contains status and details
    status = result.get("status", "unknown")
    return {
        "status": status,
        "details": result,
    }


async def _check_sql_server(connection_pool: Any) -> dict[str, Any]:
    """Check SQL Server connection pool health."""
    if not connection_pool:
        return {
            "status": "not_configured",
            "message": "SQL Server connection pool not initialized",
        }
    result = await _safe_service_check(connection_pool, "check_health")
    if "error" in result:
        return result
    return {"status": result.get("status", "unknown"), "details": result}


async def _check_cache(cache_service: Any) -> dict[str, Any]:
    """Check cache service health."""
    result = await _safe_service_check(cache_service, "get_status")
    if "error" in result:
        return result
    return {"status": result.get("status", "unknown"), "details": result}


def _determine_overall_status(services: dict[str, dict[str, Any]]) -> str:
    """Determine overall health status from individual service statuses."""
    if any(s.get("status") == "unhealthy" for s in services.values()):
        return "unhealthy"
    if any(s.get("status") == "degraded" for s in services.values()):
        return "degraded"
    return "healthy"


@router.get("/", response_model=ApiResponse[HealthCheckResponse])
async def health_check_v2() -> ApiResponse[HealthCheckResponse]:
    """
    Enhanced health check endpoint
    Returns detailed health status of all services
    """
    return await _get_health_data()


@router.get("/detailed", response_model=ApiResponse[HealthCheckResponse])
async def health_check_detailed_v2(
    current_user: Any = Depends(get_current_user),
) -> ApiResponse[HealthCheckResponse]:
    """
    Detailed health check endpoint (requires authentication)
    Returns even more internal details of services
    """
    return await _get_health_data()


async def _get_health_data() -> ApiResponse[HealthCheckResponse]:
    """Internal helper to get health data."""
    try:
        from backend.core.lifespan import cache_service, connection_pool, database_health_service

        services = {
            "mongodb": await _check_mongodb(database_health_service),
            "sql_server": await _check_sql_server(connection_pool),
            "cache": await _check_cache(cache_service),
        }

        overall_status = _determine_overall_status(services)

        health_response = HealthCheckResponse(
            status=overall_status,
            services=services,
            version="2.0.0",
        )

        return ApiResponse.success_response(
            data=health_response,
            message="Health check completed successfully",
        )

    except Exception as e:
        return ApiResponse.error_response(
            error_code="HEALTH_CHECK_FAILED",
            error_message=f"Health check failed: {str(e)}",
        )


# Keep richer metrics route on a distinct path to avoid duplicate /detailed route registration.
@router.get("/metrics-detailed", response_model=ApiResponse[dict[str, Any]])
async def detailed_health_check(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> ApiResponse[dict[str, Any]]:
    """
    Detailed health check (requires authentication)
    Returns comprehensive system status including metrics
    """
    try:
        from backend.core.lifespan import (
            cache_service,
            connection_pool,
            database_health_service,
            monitoring_service,
        )

        health_data: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            "services": {
                "mongodb": await _safe_service_check(database_health_service, "check_mongo_health"),
                "sql_server_pool": await _safe_service_check(connection_pool, "get_stats"),
                "cache": await _safe_service_check(cache_service, "get_status"),
            },
            "metrics": await _safe_service_check(monitoring_service, "get_metrics"),
        }

        return ApiResponse.success_response(
            data=health_data,
            message="Detailed health check completed",
        )

    except Exception as e:
        return ApiResponse.error_response(
            error_code="DETAILED_HEALTH_CHECK_FAILED",
            error_message=f"Detailed health check failed: {str(e)}",
        )
