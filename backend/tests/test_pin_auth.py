"""
Tests for PIN Authentication endpoints
"""

import pytest
from fastapi.testclient import TestClient
from backend.server import app

from backend.tests.utils.in_memory_db import setup_server_with_in_memory_db


@pytest.fixture
def fake_environment(monkeypatch):
    """Provide an isolated in-memory database and refresh token service for each test."""
    db = setup_server_with_in_memory_db(monkeypatch)

    # Disable single session to allow login after register
    from backend.config import settings

    monkeypatch.setattr(settings, "AUTH_SINGLE_SESSION", False)

    # Remove the mock get_current_user overrides to verify real token logic
    from backend.auth.dependencies import get_current_user

    app.dependency_overrides.pop(get_current_user, None)

    # Also remove from server module if imported differently
    import backend.server as server_module

    app.dependency_overrides.pop(server_module.get_current_user, None)

    return db


@pytest.fixture
def client(fake_environment):
    """Test client fixture"""
    return TestClient(app)


@pytest.fixture
def test_user():
    """Test user data"""
    return {
        "username": "test_pin_user_auth",
        "password": "Password123!",
        "full_name": "Test Pin User",
        "role": "staff",
    }


@pytest.fixture
def auth_token(client, test_user):
    """Register and login to get auth token"""
    # Register
    client.post("/api/auth/register", json=test_user)

    # Login
    response = client.post(
        "/api/auth/login",
        json={"username": test_user["username"], "password": test_user["password"]},
    )
    payload = response.json()
    # ApiResponse wrapper
    if "data" in payload:
        return payload["data"]["access_token"]
    return payload["access_token"]


class TestPinAuth:
    """Test PIN authentication endpoints"""

    def test_change_pin_success(self, client, auth_token, test_user):
        """Test successful PIN change"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        payload = {"current_password": test_user["password"], "new_pin": "8520"}

        # Route: /api/auth/pin/change
        response = client.post("/api/auth/pin/change", json=payload, headers=headers)

        assert response.status_code == 200
        # ApiResponse wrapper? Let's check.
        # usually 200 responses are ApiResponse or direct models
        assert "PIN changed successfully" in str(response.json())

    def test_change_pin_invalid_format(self, client, auth_token, test_user):
        """Test PIN change with invalid format (too short)"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        payload = {
            "current_password": test_user["password"],
            "new_pin": "123",  # Too short
        }

        response = client.post("/api/auth/pin/change", json=payload, headers=headers)

        assert response.status_code == 422  # Pydantic validation error

    def test_login_with_pin_success(self, client, auth_token, test_user):
        """Test successful login with PIN"""
        # First set the PIN
        headers = {"Authorization": f"Bearer {auth_token}"}
        setup_payload = {"current_password": test_user["password"], "new_pin": "8520"}
        client.post("/api/auth/pin/change", json=setup_payload, headers=headers)

        # Now try to login with PIN - needs username
        login_payload = {"username": test_user["username"], "pin": "8520"}

        # Route: /api/auth/login/pin
        response = client.post("/api/auth/login/pin", json=login_payload)

        assert response.status_code == 200
        payload = response.json()

        # Handle optional ApiResponse wrapper
        data = payload.get("data") if "data" in payload else payload
        assert "access_token" in data
        assert data["user"]["username"] == test_user["username"]

    def test_login_with_invalid_pin(self, client, auth_token, test_user):
        """Test login with incorrect PIN"""
        # First set the PIN
        headers = {"Authorization": f"Bearer {auth_token}"}
        setup_payload = {"current_password": test_user["password"], "new_pin": "8520"}
        client.post("/api/auth/pin/change", json=setup_payload, headers=headers)

        # Try login with wrong PIN
        login_payload = {"username": test_user["username"], "pin": "0000"}

        response = client.post("/api/auth/login/pin", json=login_payload)

        # Should be 401. ApiResponse or direct?
        assert response.status_code == 401
        assert "Invalid PIN" in str(response.json())

    def test_login_pin_user_not_found(self, client):
        """Test PIN login for non-existent user"""
        login_payload = {"username": "non_existent", "pin": "9999"}

        response = client.post("/api/auth/login/pin", json=login_payload)

        assert response.status_code == 401
