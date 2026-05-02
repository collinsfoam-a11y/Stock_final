from httpx import ASGITransport, AsyncClient
import pytest

from backend.api import auth_routes
from backend.server import app


class _FakeUsersCollection:
    def __init__(self, users):
        self._users = users

    async def find_one(self, query):
        for user in self._users:
            if all(user.get(key) == value for key, value in query.items()):
                return user
        return None


class _FakeDeleteCollection:
    async def delete_many(self, query):
        return None


class _FakeOTPService:
    def __init__(self, db):
        self.db = db
        self.otp_collection = _FakeDeleteCollection()

    async def initialize(self):
        return None

    async def create_otp(self, user_id: str):
        return "123456"

    async def verify_otp(self, user_id: str, code: str):
        if user_id == "user-1" and code == "123456":
            return True, "Success"
        return False, "Invalid OTP code"

    async def create_reset_token(self, user_id: str):
        return f"reset-{user_id}"


class _FakeAuditService:
    def __init__(self, db):
        self.db = db

    async def log_event(self, **kwargs):
        return None


class _DisabledWhatsAppService:
    def is_delivery_configured(self):
        return False


class _WorkingWhatsAppService:
    def is_delivery_configured(self):
        return True

    async def send_otp(self, phone_number: str, otp: str):
        return True

    async def send_password_reset_confirmation(self, phone_number: str):
        return True


class _FakeDB:
    def __init__(self):
        self.users = _FakeUsersCollection(
            [
                {
                    "_id": "user-1",
                    "username": "staff1",
                    "phone_number": "+919999999999",
                }
            ]
        )


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_password_reset_request_fails_when_delivery_unavailable(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(auth_routes, "get_db", lambda: _FakeDB())
    monkeypatch.setattr(auth_routes, "OTPService", _FakeOTPService)
    monkeypatch.setattr(auth_routes, "WhatsAppService", lambda: _DisabledWhatsAppService())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://localhost",
    ) as client:
        response = await client.post(
            "/api/auth/password-reset/request",
            json={"username": "staff1"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is False
    assert "temporarily unavailable" in payload["error"]["message"].lower()


@pytest.mark.asyncio
async def test_password_reset_verify_accepts_phone_number(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(auth_routes, "get_db", lambda: _FakeDB())
    monkeypatch.setattr(auth_routes, "OTPService", _FakeOTPService)
    monkeypatch.setattr("backend.services.audit_service.AuditService", _FakeAuditService)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://localhost",
    ) as client:
        response = await client.post(
            "/api/auth/password-reset/verify",
            json={"phone_number": "+919999999999", "otp": "123456"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["reset_token"] == "reset-user-1"
