"""
Metrics API
Prometheus-compatible metrics endpoint
"""

from fastapi import APIRouter, Depends, Response

from backend.services.metrics_query_service import MetricsQueryService, get_metrics_query_service

metrics_router = APIRouter(prefix="/metrics", tags=["metrics"])

# Global monitoring service reference (will be set from server.py)
_monitoring_service = None


def set_monitoring_service(service):
    """Set the monitoring service instance"""
    global _monitoring_service
    _monitoring_service = service


@metrics_router.get("", response_model=None)
async def get_prometheus_metrics():
    """
    Get metrics in Prometheus text format
    This endpoint can be scraped by Prometheus for monitoring
    """
    if _monitoring_service is None:
        # No monitoring service available
        return Response(
            content="# No monitoring service available\n",
            media_type="text/plain; version=0.0.4",
        )

    metrics_text = await _monitoring_service.get_prometheus_metrics()

    return Response(content=metrics_text, media_type="text/plain; version=0.0.4")


@metrics_router.get("/json")
async def get_metrics_json():
    """Get metrics in JSON format for dashboards"""
    if _monitoring_service is None:
        return {
            "success": False,
            "error": {
                "message": "Monitoring service not available",
                "code": "SERVICE_UNAVAILABLE",
            },
        }

    metrics = await _monitoring_service.get_metrics()

    return {"success": True, "data": metrics}


@metrics_router.get("/health")
async def get_health_metrics():
    """Get health status metrics with database status"""
    from backend.core.globals import database_health_service

    health_data = {
        "status": "healthy",
        "uptime": 0,
        "mongodb": {"status": "unknown"},
        "dependencies": {"sql_server": {"status": "unknown"}},
    }

    # Get monitoring service health if available
    if _monitoring_service is not None:
        monitoring_health = await _monitoring_service.get_health()
        health_data.update(monitoring_health)

    # Get database health if available
    if database_health_service:
        db_status = database_health_service.get_status()

        # Update MongoDB status
        mongo_info = db_status.get("mongo", {})
        health_data["mongodb"] = {
            "status": "connected" if mongo_info.get("status") == "healthy" else "disconnected",
            "response_time": mongo_info.get("response_time"),
            "error": mongo_info.get("error"),
        }

        # Update SQL Server status in dependencies
        sql_info = db_status.get("sql_server", {})
        health_data["dependencies"]["sql_server"] = sql_info

        # Update overall status if DB is unhealthy
        if db_status.get("overall") != "healthy":
            health_data["status"] = db_status.get("overall")

    return {"success": True, "data": health_data}


@metrics_router.get("/stats")
async def get_metrics_stats(
    metrics_service: MetricsQueryService = Depends(get_metrics_query_service),
):
    """Get system statistics and metrics"""
    return {"success": True, "data": await metrics_service.get_system_stats(_monitoring_service)}


@metrics_router.get("/staff-performance")
async def get_staff_performance(
    metrics_service: MetricsQueryService = Depends(get_metrics_query_service),
):
    """Get staff performance metrics"""
    return {"success": True, "data": await metrics_service.get_staff_performance()}
