"""
Unit tests for NotificationService
"""

from unittest.mock import AsyncMock

import pytest
from backend.services.notification_service import (
    NotificationService,
    NotificationType,
    NotificationPriority,
)


class MockDB:
    """Mock database for testing"""

    def __init__(self):
        self.notifications = MockCollection()
        self.notification_devices = MockCollection()


class MockCollection:
    """Mock MongoDB collection"""

    def __init__(self):
        self.data = []

    async def insert_one(self, doc):
        """Mock insert_one"""
        from bson import ObjectId

        doc["_id"] = ObjectId()
        self.data.append(doc)
        return type("obj", (object,), {"inserted_id": str(doc["_id"])})

    def find(self, query):
        """Mock find - returns cursor (sync like Motor)"""
        self._last_query = query
        return self

    def sort(self, field, direction):
        """Mock sort"""
        return self

    def limit(self, count):
        """Mock limit"""
        return self

    async def to_list(self, length):
        """Mock to_list"""
        query = getattr(self, "_last_query", {})
        result = []
        for notif in self.data:
            match = True
            for key, value in query.items():
                if notif.get(key) != value:
                    match = False
                    break
            if match:
                result.append(notif)
        return result[:length]

    async def count_documents(self, query):
        """Mock count_documents"""
        count = 0
        for notif in self.data:
            match = True
            for key, value in query.items():
                if notif.get(key) != value:
                    match = False
                    break
            if match:
                count += 1
        return count

    async def update_one(self, query, update, upsert=False):
        """Mock update_one"""
        notif_id = query.get("_id")
        token = query.get("token")
        user_id = query.get("user_id")

        for notif in self.data:
            if notif_id is not None and notif.get("_id") == notif_id:
                notif.update(update.get("$set", {}))
                return type("obj", (object,), {"modified_count": 1})
            if token is not None and user_id is not None:
                if notif.get("token") == token and notif.get("user_id") == user_id:
                    notif.update(update.get("$set", {}))
                    return type("obj", (object,), {"modified_count": 1})

        if upsert:
            doc = {**query, **update.get("$setOnInsert", {}), **update.get("$set", {})}
            self.data.append(doc)
            return type("obj", (object,), {"modified_count": 1})

        return type("obj", (object,), {"modified_count": 0})

    async def update_many(self, query, update):
        """Mock update_many"""
        count = 0
        token_in = (
            query.get("token", {}).get("$in") if isinstance(query.get("token"), dict) else None
        )
        for notif in self.data:
            match = True
            for key, value in query.items():
                if key == "token" and token_in is not None:
                    if notif.get("token") not in token_in:
                        match = False
                        break
                elif notif.get(key) != value:
                    match = False
                    break
            if match:
                notif.update(update.get("$set", {}))
                count += 1

        return type("obj", (object,), {"modified_count": count})

    async def delete_one(self, query):
        """Mock delete_one"""
        notif_id = query.get("_id")

        for i, notif in enumerate(self.data):
            if notif.get("_id") == notif_id:
                self.data.pop(i)
                return type("obj", (object,), {"deleted_count": 1})

        return type("obj", (object,), {"deleted_count": 0})


@pytest.mark.asyncio
async def test_create_notification():
    """Test creating a notification"""
    db = MockDB()
    service = NotificationService(db)
    service._send_push_notification = AsyncMock()

    notif_id = await service.create_notification(
        user_id="user1",
        notification_type=NotificationType.RECOUNT_ASSIGNED,
        title="Test Notification",
        message="This is a test",
        priority=NotificationPriority.HIGH,
    )

    assert notif_id is not None
    assert len(db.notifications.data) == 1

    notif = db.notifications.data[0]
    assert notif["user_id"] == "user1"
    assert notif["type"] == "recount_assigned"
    assert notif["title"] == "Test Notification"
    assert notif["message"] == "This is a test"
    assert notif["priority"] == "high"
    assert notif["read"] is False
    service._send_push_notification.assert_awaited_once()


@pytest.mark.asyncio
async def test_notify_recount_assigned():
    """Test recount assignment notification"""
    db = MockDB()
    service = NotificationService(db)

    notif_id = await service.notify_recount_assigned(
        user_id="user1",
        count_line_id="count_001",
        item_name="Test Item",
        reason="Variance too high",
        assigned_by="supervisor1",
    )

    assert notif_id is not None
    notif = db.notifications.data[0]

    assert notif["type"] == "recount_assigned"
    assert notif["priority"] == "high"
    assert "Test Item" in notif["message"]
    assert notif["metadata"]["count_line_id"] == "count_001"
    assert notif["metadata"]["reason"] == "Variance too high"


@pytest.mark.asyncio
async def test_notify_count_approved():
    """Test count approval notification"""
    db = MockDB()
    service = NotificationService(db)

    notif_id = await service.notify_count_approved(
        user_id="user1", count_line_id="count_002", item_name="Test Item", approved_by="supervisor1"
    )
    assert notif_id is not None

    notif = db.notifications.data[0]
    assert notif["type"] == "count_approved"
    assert notif["priority"] == "medium"
    assert "approved" in notif["message"].lower()


@pytest.mark.asyncio
async def test_notify_count_rejected():
    """Test count rejection notification"""
    db = MockDB()
    service = NotificationService(db)

    notif_id = await service.notify_count_rejected(
        user_id="user1",
        count_line_id="count_003",
        item_name="Test Item",
        reason="Photo required",
        rejected_by="supervisor1",
    )
    assert notif_id is not None

    notif = db.notifications.data[0]
    assert notif["type"] == "count_rejected"
    assert notif["priority"] == "high"
    assert "rejected" in notif["message"].lower()
    assert notif["metadata"]["reason"] == "Photo required"


@pytest.mark.asyncio
async def test_get_user_notifications():
    """Test getting user notifications"""
    db = MockDB()
    service = NotificationService(db)

    # Create multiple notifications
    await service.create_notification(
        user_id="user1",
        notification_type=NotificationType.SYSTEM_ALERT,
        title="Notification 1",
        message="Message 1",
    )

    await service.create_notification(
        user_id="user1",
        notification_type=NotificationType.SYSTEM_ALERT,
        title="Notification 2",
        message="Message 2",
    )

    notifications = await service.get_user_notifications("user1")

    assert len(notifications) == 2


@pytest.mark.asyncio
async def test_get_unread_notifications_only():
    """Test getting only unread notifications"""
    db = MockDB()
    service = NotificationService(db)

    # Create notifications
    notif1_id = await service.create_notification(
        user_id="user1",
        notification_type=NotificationType.SYSTEM_ALERT,
        title="Unread",
        message="Unread message",
    )
    assert notif1_id is not None

    notif2_id = await service.create_notification(
        user_id="user1",
        notification_type=NotificationType.SYSTEM_ALERT,
        title="Read",
        message="Read message",
    )

    # Mark one as read
    await service.mark_as_read(notif2_id, "user1")

    # Get unread only
    unread = await service.get_user_notifications("user1", unread_only=True)

    # Should only get unread ones
    assert any(n["title"] == "Unread" for n in unread)


@pytest.mark.asyncio
async def test_mark_as_read():
    """Test marking notification as read"""
    db = MockDB()
    service = NotificationService(db)

    notif_id = await service.create_notification(
        user_id="user1",
        notification_type=NotificationType.SYSTEM_ALERT,
        title="Test",
        message="Test",
    )

    success = await service.mark_as_read(notif_id, "user1")

    assert success is True
    notif = db.notifications.data[0]
    assert notif["read"] is True
    assert notif["read_at"] is not None


@pytest.mark.asyncio
async def test_mark_all_as_read():
    """Test marking all notifications as read"""
    db = MockDB()
    service = NotificationService(db)

    # Create multiple unread notifications
    for i in range(3):
        await service.create_notification(
            user_id="user1",
            notification_type=NotificationType.SYSTEM_ALERT,
            title=f"Notification {i}",
            message=f"Message {i}",
        )

    count = await service.mark_all_as_read("user1")

    assert count == 3
    for notif in db.notifications.data:
        assert notif["read"] is True


@pytest.mark.asyncio
async def test_delete_notification():
    """Test deleting a notification"""
    db = MockDB()
    service = NotificationService(db)

    notif_id = await service.create_notification(
        user_id="user1",
        notification_type=NotificationType.SYSTEM_ALERT,
        title="Test",
        message="Test",
    )

    success = await service.delete_notification(notif_id, "user1")

    assert success is True
    assert len(db.notifications.data) == 0


@pytest.mark.asyncio
async def test_get_unread_count():
    """Test getting unread count"""
    db = MockDB()
    service = NotificationService(db)

    # Create 2 unread, 1 read
    for i in range(3):
        notif_id = await service.create_notification(
            user_id="user1",
            notification_type=NotificationType.SYSTEM_ALERT,
            title=f"Notification {i}",
            message=f"Message {i}",
        )

        if i == 2:
            await service.mark_as_read(notif_id, "user1")

    count = await service.get_unread_count("user1")

    assert count == 2


@pytest.mark.asyncio
async def test_register_and_unregister_device():
    db = MockDB()
    service = NotificationService(db)

    await service.register_device("user1", "ExpoPushToken[test]", "android")
    assert len(db.notification_devices.data) == 1
    assert db.notification_devices.data[0]["enabled"] is True

    await service.unregister_device("user1", "ExpoPushToken[test]")
    assert db.notification_devices.data[0]["enabled"] is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
