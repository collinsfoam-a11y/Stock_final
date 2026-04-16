"""
Notification Service - Push and in-app notifications

Supports:
- Recount assignments
- Approval decisions
- Session reminders
- System alerts
"""

import logging
import os
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class NotificationType(str, Enum):
    """Types of notifications"""

    RECOUNT_ASSIGNED = "recount_assigned"
    COUNT_APPROVED = "count_approved"
    COUNT_REJECTED = "count_rejected"
    SESSION_REMINDER = "session_reminder"
    VARIANCE_ALERT = "variance_alert"
    SYSTEM_ALERT = "system_alert"


class NotificationPriority(str, Enum):
    """Notification priority levels"""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class NotificationService:
    """Service for managing notifications"""

    def __init__(self, db):
        self.db = db
        self.notification_devices = getattr(db, "notification_devices", None)
        self.push_endpoint = os.getenv("EXPO_PUSH_ENDPOINT", "https://exp.host/--/api/v2/push/send")

    async def create_notification(
        self,
        user_id: str,
        notification_type: NotificationType,
        title: str,
        message: str,
        priority: NotificationPriority = NotificationPriority.MEDIUM,
        action_url: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Create a new notification.

        Args:
            user_id: Target user ID
            notification_type: Type of notification
            title: Notification title
            message: Notification message
            priority: Priority level
            action_url: Optional URL for action
            metadata: Optional additional data

        Returns:
            Notification ID
        """
        notification = {
            "user_id": user_id,
            "type": notification_type.value,
            "title": title,
            "message": message,
            "priority": priority.value,
            "action_url": action_url,
            "metadata": metadata or {},
            "read": False,
            "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "read_at": None,
        }

        result = await self.db.notifications.insert_one(notification)
        notification_id = str(result.inserted_id)

        logger.info(f"Created notification {notification_id} for user {user_id}: {title}")

        try:
            await self._send_push_notification(user_id, notification)
        except Exception as exc:
            logger.warning(f"Push notification delivery skipped for {user_id}: {exc}")

        return notification_id

    async def register_device(
        self,
        user_id: str,
        token: str,
        platform: Optional[str] = None,
    ) -> None:
        """Register or refresh a push-capable device token."""
        if not self.notification_devices or not token:
            return

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        await self.notification_devices.update_one(
            {"user_id": user_id, "token": token},
            {
                "$set": {
                    "platform": platform or "unknown",
                    "enabled": True,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "created_at": now,
                },
            },
            upsert=True,
        )

    async def unregister_device(self, user_id: str, token: str) -> None:
        """Disable a previously registered device token."""
        if not self.notification_devices or not token:
            return

        await self.notification_devices.update_one(
            {"user_id": user_id, "token": token},
            {
                "$set": {
                    "enabled": False,
                    "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            },
        )

    async def notify_recount_assigned(
        self,
        user_id: str,
        count_line_id: str,
        item_name: str,
        reason: str,
        assigned_by: str,
        session_id: Optional[str] = None,
        item_code: Optional[str] = None,
        barcode: Optional[str] = None,
        assigned_to: Optional[str] = None,
    ) -> str:
        """Notify user of recount assignment"""
        return await self.create_notification(
            user_id=user_id,
            notification_type=NotificationType.RECOUNT_ASSIGNED,
            title="Recount Requested",
            message=f"Please recount '{item_name}'. Reason: {reason}",
            priority=NotificationPriority.HIGH,
            action_url=f"/count-lines/{count_line_id}",
            metadata={
                "count_line_id": count_line_id,
                "item_name": item_name,
                "reason": reason,
                "assigned_by": assigned_by,
                "session_id": session_id,
                "item_code": item_code,
                "barcode": barcode,
                "assigned_to": assigned_to or user_id,
            },
        )

    async def notify_count_approved(
        self,
        user_id: str,
        count_line_id: str,
        item_name: str,
        approved_by: str,
        session_id: Optional[str] = None,
        item_code: Optional[str] = None,
        barcode: Optional[str] = None,
    ) -> str:
        """Notify user that their count was approved"""
        return await self.create_notification(
            user_id=user_id,
            notification_type=NotificationType.COUNT_APPROVED,
            title="Count Approved",
            message=f"Your count for '{item_name}' has been approved",
            priority=NotificationPriority.MEDIUM,
            action_url=f"/count-lines/{count_line_id}",
            metadata={
                "count_line_id": count_line_id,
                "item_name": item_name,
                "approved_by": approved_by,
                "session_id": session_id,
                "item_code": item_code,
                "barcode": barcode,
            },
        )

    async def notify_count_rejected(
        self,
        user_id: str,
        count_line_id: str,
        item_name: str,
        reason: str,
        rejected_by: str,
        session_id: Optional[str] = None,
        item_code: Optional[str] = None,
        barcode: Optional[str] = None,
    ) -> str:
        """Notify user that their count was rejected"""
        return await self.create_notification(
            user_id=user_id,
            notification_type=NotificationType.COUNT_REJECTED,
            title="Count Rejected",
            message=f"Your count for '{item_name}' was rejected. Reason: {reason}",
            priority=NotificationPriority.HIGH,
            action_url=f"/count-lines/{count_line_id}",
            metadata={
                "count_line_id": count_line_id,
                "item_name": item_name,
                "reason": reason,
                "rejected_by": rejected_by,
                "session_id": session_id,
                "item_code": item_code,
                "barcode": barcode,
            },
        )

    async def get_user_notifications(
        self, user_id: str, unread_only: bool = False, limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get notifications for a user"""
        query: Dict[str, Any] = {"user_id": user_id}
        if unread_only:
            query["read"] = False

        notifications = (
            await self.db.notifications.find(query)
            .sort("created_at", -1)
            .limit(limit)
            .to_list(limit)
        )

        # Convert ObjectId to string
        for notif in notifications:
            notif["_id"] = str(notif["_id"])

        return notifications

    async def mark_as_read(self, notification_id: str, user_id: str) -> bool:
        """Mark notification as read"""
        from bson import ObjectId

        result = await self.db.notifications.update_one(
            {"_id": ObjectId(notification_id), "user_id": user_id},
            {"$set": {"read": True, "read_at": datetime.now(timezone.utc).replace(tzinfo=None)}},
        )

        return result.modified_count > 0

    async def mark_all_as_read(self, user_id: str) -> int:
        """Mark all notifications as read for a user"""
        result = await self.db.notifications.update_many(
            {"user_id": user_id, "read": False},
            {"$set": {"read": True, "read_at": datetime.now(timezone.utc).replace(tzinfo=None)}},
        )

        return result.modified_count

    async def delete_notification(self, notification_id: str, user_id: str) -> bool:
        """Delete a notification"""
        from bson import ObjectId

        result = await self.db.notifications.delete_one(
            {"_id": ObjectId(notification_id), "user_id": user_id}
        )

        return result.deleted_count > 0

    async def get_unread_count(self, user_id: str) -> int:
        """Get count of unread notifications"""
        return await self.db.notifications.count_documents({"user_id": user_id, "read": False})

    async def _send_push_notification(self, user_id: str, notification: Dict[str, Any]):
        """Send push notification via Expo push service for registered devices."""
        if not self.notification_devices:
            return

        devices = await self.notification_devices.find(
            {"user_id": user_id, "enabled": True}
        ).to_list(length=None)
        expo_tokens = [
            device["token"]
            for device in devices
            if isinstance(device.get("token"), str) and device["token"].startswith("ExpoPushToken[")
        ]

        if not expo_tokens:
            return

        payload = [
            {
                "to": token,
                "title": notification["title"],
                "body": notification["message"],
                "data": {
                    "type": notification.get("type"),
                    "action_url": notification.get("action_url"),
                    "metadata": notification.get("metadata", {}),
                },
                "priority": (
                    "high" if notification.get("priority") in {"high", "urgent"} else "default"
                ),
                "sound": "default",
            }
            for token in expo_tokens
        ]

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                self.push_endpoint,
                json=payload,
                headers={"Content-Type": "application/json"},
            )

        if response.status_code >= 400:
            raise RuntimeError(f"Expo push request failed with status {response.status_code}")

        result = response.json()
        tickets = result.get("data", []) if isinstance(result, dict) else []
        invalid_tokens = []
        for token, ticket in zip(expo_tokens, tickets):
            details = ticket.get("details", {}) if isinstance(ticket, dict) else {}
            if ticket.get("status") == "error" and details.get("error") == "DeviceNotRegistered":
                invalid_tokens.append(token)

        if invalid_tokens:
            await self.notification_devices.update_many(
                {"user_id": user_id, "token": {"$in": invalid_tokens}},
                {
                    "$set": {
                        "enabled": False,
                        "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
                    }
                },
            )
