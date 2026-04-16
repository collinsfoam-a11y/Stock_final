"""
Tests for Authentication endpoints
"""

import pytest
from fastapi.testclient import TestClient
from backend.server import app

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
        # Register user first
        client.post("/api/auth/register", json=test_user)

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


class TestRegister:
    """Test register endpoint"""

    def test_register_success(self, client, test_user):
        """Test successful registration"""
        response = client.post("/api/auth/register", json=test_user)

        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["username"] == test_user["username"]

    def test_register_duplicate_username(self, client, test_user):
        """Test registration with duplicate username"""
        # Register first time
        client.post("/api/auth/register", json=test_user)

        # Try to register again
        response = client.post("/api/auth/register", json=test_user)

        # AUTH_USERNAME_EXISTS uses 400 in error_messages.py
        assert response.status_code == 400

    def test_register_missing_fields(self, client):
        """Test registration with missing fields"""
        response = client.post("/api/auth/register", json={"username": "test"})

        assert response.status_code == 422
