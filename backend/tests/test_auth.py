"""
Tests for Authentication endpoints
"""

import asyncio

import pytest
from fastapi.testclient import TestClient

from backend.exceptions import RateLimitError
from backend.server import app
from backend.utils.result import Fail

from backend.tests.utils.in_memory_db import setup_server_with_in_memory_db


@pytest.fixture
def fake_environment(monkeypatch):
    """Provide an isolated in-memory database and refresh token service for each test."""
    db = setup_server_with_in_memory_db(monkeypatch)
    # FOR THIS TEST: Disable single session enforcement to allow login after register
    from backend.config import settings

    monkeypatch.setattr(settings, "AUTH_SINGLE_SESSION", False)
    return db


@pytest.fixture
def client(fake_environment):
    """Test client fixture"""
    return TestClient(app)


@pytest.fixture
def test_user():
    """Test user data"""
    return {
        "username": "test_user_auth",
        "password": "test123_Pass!",
        "full_name": "Test User",
        "role": "staff",
    }


class TestLogin:
    """Test login endpoint"""

    def test_login_success(self, client, test_user):
        """Test successful login"""
        # Login as admin to get token
        admin_login = client.post(
            "/api/auth/login", json={"username": "admin", "password": "admin123"}
        )
        admin_token = admin_login.json()["data"]["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Register user first
        client.post("/api/auth/register", json=test_user, headers=headers)

        # Login
        response = client.post(
            "/api/auth/login",
            json={"username": test_user["username"], "password": test_user["password"]},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload.get("success") is True

        # Correctly handle ApiResponse wrapper
        token_payload = payload.get("data")
        assert token_payload is not None
        assert "access_token" in token_payload
        assert "refresh_token" in token_payload
        assert "user" in token_payload

    def test_login_invalid_credentials(self, client):
        """Test login with invalid credentials"""
        response = client.post(
            "/api/auth/login", json={"username": "invalid", "password": "invalid"}
        )

        assert response.status_code == 401

    def test_login_missing_fields(self, client):
        """Test login with missing fields"""
        response = client.post("/api/auth/login", json={"username": "test"})

        assert response.status_code == 422
        payload = response.json()
        assert payload["detail"]["code"] == "AUTH_VALIDATION_ERROR"
        assert payload["detail"]["message"] == (
            "Some authentication details are missing or invalid."
        )
        assert payload["detail"]["fields"]["password"] == "Field required"

    def test_login_disabled_account_returns_stable_error_code(
        self, client, test_user, fake_environment
    ):
        """Disabled accounts should return a stable frontend-friendly auth code."""
        admin_login = client.post(
            "/api/auth/login", json={"username": "admin", "password": "admin123"}
        )
        admin_token = admin_login.json()["data"]["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        client.post("/api/auth/register", json=test_user, headers=headers)
        asyncio.run(
            fake_environment.users.update_one(
                {"username": test_user["username"]},
                {"$set": {"is_active": False}},
            )
        )

        response = client.post(
            "/api/auth/login",
            json={"username": test_user["username"], "password": test_user["password"]},
        )

        assert response.status_code == 403
        payload = response.json()
        assert payload["detail"]["error"] == "ACCOUNT_DISABLED"
        assert "deactivated" in payload["detail"]["message"].lower()

    def test_login_rate_limit_includes_retry_after(self, client, monkeypatch):
        """Rate-limited login responses should include retry metadata for the UI."""
        from backend.api import auth_routes

        async def fake_rate_limit_check(_client_ip: str):
            return Fail(RateLimitError("Too many login attempts", retry_after=90))

        monkeypatch.setattr(auth_routes, "_check_login_rate_limit", fake_rate_limit_check)

        response = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )

        assert response.status_code == 429
        payload = response.json()
        assert payload["detail"]["error"] == "RATE_LIMIT_ERROR"
        assert payload["detail"]["details"]["retry_after"] == 90


class TestRegister:
    """Test register endpoint"""

    def test_register_success(self, client, test_user):
        """Test successful registration"""
        # Login as admin to get token
        admin_login = client.post(
            "/api/auth/login", json={"username": "admin", "password": "admin123"}
        )
        assert admin_login.status_code == 200
        admin_token = admin_login.json()["data"]["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        response = client.post("/api/auth/register", json=test_user, headers=headers)

        assert response.status_code == 201, f"Response: {response.json()}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["username"] == test_user["username"]

    def test_register_duplicate_username(self, client, test_user):
        """Test registration with duplicate username"""
        # Login as admin to get token
        admin_login = client.post(
            "/api/auth/login", json={"username": "admin", "password": "admin123"}
        )
        admin_token = admin_login.json()["data"]["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Register first time
        client.post("/api/auth/register", json=test_user, headers=headers)

        # Try to register again
        response = client.post("/api/auth/register", json=test_user, headers=headers)

        # AUTH_USERNAME_EXISTS uses 400 in error_messages.py
        assert response.status_code == 400
        payload = response.json()
        assert payload["detail"]["code"] == "AUTH_USERNAME_EXISTS"
        assert "username" in payload["detail"]["fields"]
        assert "already exists" in payload["detail"]["fields"]["username"].lower()

    def test_register_missing_fields(self, client):
        """Test registration with missing fields"""
        # Login as admin to get token
        admin_login = client.post(
            "/api/auth/login", json={"username": "admin", "password": "admin123"}
        )
        admin_token = admin_login.json()["data"]["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        response = client.post("/api/auth/register", json={"username": "test"}, headers=headers)

        assert response.status_code == 422
        payload = response.json()
        assert payload["detail"]["code"] == "AUTH_VALIDATION_ERROR"
        assert payload["detail"]["fields"]["password"] == "Field required"
        assert payload["detail"]["fields"]["full_name"] == "Field required"
