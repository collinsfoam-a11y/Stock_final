"""
Notifications API - In-app notifications and task management
"""

import logging
from typing import Any, NoReturn, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.auth.dependencies import get_current_user
from backend.db.runtime import get_db
from backend.services.notification_service import NotificationService, NotificationType, NotificationPriority
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


def _safe_log_value(value: Any, *, max_length: int = 200) -> str:
    return sanitize_for_logging("" if value is None else str(value), max_length=max_length)


def _raise_notifications_internal_error(detail: str, exc: Exception) -> NoReturn:
    raise HTTPException(status_code=500, detail=detail) from exc


def _get_user_id(current_user: dict) -> str:
    return (
        current_user.get("username")
        or current_user.get("user_id")
        or current_user.get("id")
        or str(current_user.get("_id", "unknown"))
    )


# Response Models


class NotificationResponse(BaseModel):
    """Single notification response"""

    id: str
    type: str
    title: str
    message: str
    priority: str
    action_url: Optional[str] = None
    read: bool
    created_at: str
    read_at: Optional[str] = None


class NotificationListResponse(BaseModel):
    """List of notifications with count"""

    notifications: list[dict]
    total: int
    unread_count: int


class BatchNotificationRequest(BaseModel):
    """Request for batch notifications"""

    user_ids: list[str]
    notification_type: str
    title: str
    message: str
    priority: str = "medium"
    action_url: Optional[str] = None
    unread_count: int


class NotificationDeviceRequest(BaseModel):
    token: str
    platform: Optional[str] = None


# API Endpoints


@router.get("", response_model=NotificationListResponse)
@router.get("/", response_model=NotificationListResponse)
async def get_notifications(
    unread_only: bool = Query(False, description="Show only unread notifications"),
    limit: int = Query(50, ge=1, le=100, description="Maximum notifications to return"),
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Get user's notifications.

    Returns in-app notifications with optional filtering.
    """
    try:
        notification_service = NotificationService(db)
        user_id = _get_user_id(current_user)

        notifications = await notification_service.get_user_notifications(
            user_id=user_id,
            unread_only=unread_only,
            limit=limit,
        )

        unread_count = await notification_service.get_unread_count(user_id=user_id)

        return NotificationListResponse(
            notifications=notifications, total=len(notifications), unread_count=unread_count
        )

    except Exception as e:
        logger.error("Error fetching notifications: %s", _safe_log_value(e))
        _raise_notifications_internal_error("Failed to fetch notifications", e)


@router.get("/unread-count")
async def get_unread_count(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get count of unread notifications (for badge)"""
    try:
        notification_service = NotificationService(db)
        user_id = _get_user_id(current_user)

        count = await notification_service.get_unread_count(user_id=user_id)

        return {"unread_count": count}

    except Exception as e:
        logger.error("Error getting unread count: %s", _safe_log_value(e))
        _raise_notifications_internal_error("Failed to get unread count", e)


@router.post("/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Mark a notification as read"""
    try:
        notification_service = NotificationService(db)
        user_id = _get_user_id(current_user)

        success = await notification_service.mark_as_read(
            notification_id=notification_id,
            user_id=user_id,
        )

        if not success:
            raise HTTPException(status_code=404, detail="Notification not found")

        return {"success": True, "message": "Notification marked as read"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error marking notification as read: %s", _safe_log_value(e))
        _raise_notifications_internal_error("Failed to mark notification as read", e)


@router.post("/mark-all-read")
async def mark_all_notifications_as_read(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Mark all notifications as read"""
    try:
        notification_service = NotificationService(db)
        user_id = _get_user_id(current_user)

        count = await notification_service.mark_all_as_read(user_id=user_id)

        return {"success": True, "message": f"Marked {count} notifications as read", "count": count}

    except Exception as e:
        logger.error("Error marking all notifications as read: %s", _safe_log_value(e))
        _raise_notifications_internal_error("Failed to mark all notifications as read", e)


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Delete a notification"""
    try:
        notification_service = NotificationService(db)
        user_id = _get_user_id(current_user)

        success = await notification_service.delete_notification(
            notification_id=notification_id,
            user_id=user_id,
        )

        if not success:
            raise HTTPException(status_code=404, detail="Notification not found")

        return {"success": True, "message": "Notification deleted"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error deleting notification: %s", _safe_log_value(e))
        _raise_notifications_internal_error("Failed to delete notification", e)


@router.post("/devices")
async def register_notification_device(
    payload: NotificationDeviceRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Register a push token for the current user."""
    try:
        notification_service = NotificationService(db)
        user_id = _get_user_id(current_user)
        await notification_service.register_device(
            user_id=user_id,
            token=payload.token,
            platform=payload.platform,
        )
        return {"success": True, "message": "Notification device registered"}
    except Exception as e:
        logger.error("Error registering notification device: %s", _safe_log_value(e))
        _raise_notifications_internal_error("Failed to register notification device", e)


@router.post("/devices/unregister")
async def unregister_notification_device(
    payload: NotificationDeviceRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Disable a push token for the current user."""
    try:
        notification_service = NotificationService(db)
        user_id = _get_user_id(current_user)
        await notification_service.unregister_device(
            user_id=user_id,
            token=payload.token,
        )
        return {"success": True, "message": "Notification device unregistered"}
    except Exception as e:
        logger.error("Error unregistering notification device: %s", _safe_log_value(e))
        _raise_notifications_internal_error("Failed to unregister notification device", e)


@router.post("/batch")
async def send_batch_notifications(
    request: BatchNotificationRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Send notifications to multiple users at once."""
    try:
        notification_service = NotificationService(db)
        results = []
        for user_id in request.user_ids:
            try:
                notification_id = await notification_service.create_notification(
                    user_id=user_id,
                    notification_type=NotificationType(request.notification_type),
                    title=request.title,
                    message=request.message,
                    priority=NotificationPriority(request.priority),
                    action_url=request.action_url,
                )
                results.append(
                    {"user_id": user_id, "success": True, "notification_id": notification_id}
                )
            except Exception as e:
                results.append(
                    {
                        "user_id": user_id,
                        "success": False,
                        "error": _safe_log_value(e),
                    }
                )

        success_count = sum(1 for r in results if r["success"])
        return {
            "success": success_count > 0,
            "total": len(request.user_ids),
            "succeeded": success_count,
            "failed": len(results) - success_count,
            "results": results,
        }
    except Exception as e:
        logger.error("Error sending batch notifications: %s", _safe_log_value(e))
        _raise_notifications_internal_error("Failed to send batch notifications", e)
