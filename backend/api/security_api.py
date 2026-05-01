"""
Security Dashboard API
Provides endpoints for security monitoring, failed login tracking, and audit logs
"""

import logging
from backend.utils.api_utils import sanitize_for_logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo.errors import PyMongoError

from backend.auth.dependencies import get_current_user
from backend.services.security_dashboard_service import (
    SecurityDashboardService,
    get_security_dashboard_service,
)

logger = logging.getLogger(__name__)

security_router = APIRouter(prefix="/api/admin/security", tags=["Security"])
SECURITY_ERRORS = (KeyError, PyMongoError, RuntimeError, TypeError, ValueError)


def require_admin(current_user: dict = Depends(get_current_user)):
    """Require admin role"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


@security_router.get("/failed-logins")
async def get_failed_logins(
    current_user: dict = Depends(require_admin),
    limit: int = Query(100, ge=1, le=1000, description="Number of records to return"),
    hours: int = Query(24, ge=1, le=168, description="Hours to look back"),
    username: Optional[str] = Query(None, description="Filter by username"),
    ip_address: Optional[str] = Query(None, description="Filter by IP address"),
    security_service: SecurityDashboardService = Depends(get_security_dashboard_service),
):
    """Get failed login attempts"""
    try:
        return {
            "success": True,
            "data": await security_service.get_failed_logins(
                limit=limit,
                hours=hours,
                username=username,
                ip_address=ip_address,
            ),
        }
    except SECURITY_ERRORS as e:
        logger.error("Error getting failed logins: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve failed logins: {str(e)}",
        )


@security_router.get("/suspicious-activity")
async def get_suspicious_activity(
    current_user: dict = Depends(require_admin),
    hours: int = Query(24, ge=1, le=168, description="Hours to look back"),
    security_service: SecurityDashboardService = Depends(get_security_dashboard_service),
):
    """Get suspicious activity patterns"""
    try:
        return {
            "success": True,
            "data": await security_service.get_suspicious_activity(hours=hours),
        }
    except SECURITY_ERRORS as e:
        logger.error("Error getting suspicious activity: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve suspicious activity: {str(e)}",
        )


@security_router.get("/sessions")
async def get_security_sessions(
    current_user: dict = Depends(require_admin),
    limit: int = Query(100, ge=1, le=500, description="Number of records to return"),
    active_only: bool = Query(False, description="Show only active sessions"),
    security_service: SecurityDashboardService = Depends(get_security_dashboard_service),
):
    """Get all active sessions for security monitoring"""
    try:
        return {
            "success": True,
            "data": await security_service.get_sessions(limit=limit, active_only=active_only),
        }
    except SECURITY_ERRORS as e:
        logger.error("Error getting sessions: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve sessions: {str(e)}",
        )


@security_router.get("/audit-log")
async def get_audit_log(
    current_user: dict = Depends(require_admin),
    limit: int = Query(100, ge=1, le=1000, description="Number of records to return"),
    hours: int = Query(24, ge=1, le=720, description="Hours to look back"),
    action: Optional[str] = Query(None, description="Filter by action"),
    user: Optional[str] = Query(None, description="Filter by username"),
    security_service: SecurityDashboardService = Depends(get_security_dashboard_service),
):
    """Get security audit log from activity logs"""
    try:
        return {
            "success": True,
            "data": await security_service.get_audit_log(
                limit=limit,
                hours=hours,
                action=action,
                user=user,
            ),
        }
    except SECURITY_ERRORS as e:
        logger.error("Error getting audit log: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve audit log: {str(e)}",
        )


@security_router.get("/ip-tracking")
async def get_ip_tracking(
    current_user: dict = Depends(require_admin),
    hours: int = Query(24, ge=1, le=168, description="Hours to look back"),
    security_service: SecurityDashboardService = Depends(get_security_dashboard_service),
):
    """Get IP address tracking data"""
    try:
        return {
            "success": True,
            "data": await security_service.get_ip_tracking(hours=hours),
        }
    except SECURITY_ERRORS as e:
        logger.error("Error getting IP tracking: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve IP tracking: {str(e)}",
        )


@security_router.get("/summary")
async def get_security_summary(
    current_user: dict = Depends(require_admin),
    hours: int = Query(24, ge=1, le=168, description="Hours to look back"),
    security_service: SecurityDashboardService = Depends(get_security_dashboard_service),
):
    """Get security summary dashboard data"""
    try:
        return {
            "success": True,
            "data": await security_service.get_summary(hours=hours),
        }
    except SECURITY_ERRORS as e:
        logger.error("Error getting security summary: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve security summary: {str(e)}",
        )
