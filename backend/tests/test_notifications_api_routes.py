from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
import pytest

from backend.api import notifications_api


class _DummyNotificationService:
    def __init__(self, db):
        self.db = db

    async def get_user_notifications(self, user_id: str, unread_only: bool, limit: int):
        return [
            {
                "id": "notif-1",
                "type": "recount_assigned",
                "title": "Recount Requested",
                "message": "Please recount ITEM-1",
                "priority": "high",
                "read": False,
                "created_at": "2026-03-12T10:00:00Z",
            }
        ]

    async def get_unread_count(self, user_id: str):
        return 1

    async def register_device(self, user_id: str, token: str, platform: str | None = None):
        self.db["registered"] = {"user_id": user_id, "token": token, "platform": platform}

    async def unregister_device(self, user_id: str, token: str):
        self.db["unregistered"] = {"user_id": user_id, "token": token}


@pytest.fixture
def notifications_app(monkeypatch: pytest.MonkeyPatch) -> FastAPI:
    app = FastAPI()
    app.include_router(notifications_api.router)
    app.dependency_overrides[notifications_api.get_current_user] = lambda: {
        "username": "staff1",
        "role": "staff",
    }
    app.dependency_overrides[notifications_api.get_db] = lambda: {}
    monkeypatch.setattr(notifications_api, "NotificationService", _DummyNotificationService)
    return app


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["/api/notifications", "/api/notifications/"])
async def test_get_notifications_accepts_both_route_forms(notifications_app: FastAPI, path: str):
    async with AsyncClient(
        transport=ASGITransport(app=notifications_app),
        base_url="http://localhost",
    ) as client:
        response = await client.get(path, params={"limit": 5})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["unread_count"] == 1
    assert payload["notifications"][0]["id"] == "notif-1"


@pytest.mark.asyncio
async def test_register_notification_device(notifications_app: FastAPI):
    async with AsyncClient(
        transport=ASGITransport(app=notifications_app),
        base_url="http://localhost",
    ) as client:
        response = await client.post(
            "/api/notifications/devices",
            json={"token": "ExpoPushToken[test]", "platform": "android"},
        )

    assert response.status_code == 200
    assert response.json()["success"] is True


@pytest.mark.asyncio
async def test_unregister_notification_device(notifications_app: FastAPI):
    async with AsyncClient(
        transport=ASGITransport(app=notifications_app),
        base_url="http://localhost",
    ) as client:
        response = await client.post(
            "/api/notifications/devices/unregister",
            json={"token": "ExpoPushToken[test]", "platform": "android"},
        )

    assert response.status_code == 200
    assert response.json()["success"] is True
