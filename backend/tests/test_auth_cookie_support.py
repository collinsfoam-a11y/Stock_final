"""Tests for browser-oriented cookie authentication support."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock

from backend.server import app
from backend.tests.utils.in_memory_db import setup_server_with_in_memory_db


@pytest.fixture
def client(monkeypatch):
    setup_server_with_in_memory_db(monkeypatch)

    from backend.config import settings

    monkeypatch.setattr(settings, "AUTH_SINGLE_SESSION", False)
    return TestClient(app)


def test_login_sets_http_only_auth_cookies(client: TestClient):
    response = client.post(
        "/api/auth/login",
        json={"username": "staff1", "password": "staff123"},
    )

    assert response.status_code == 200
    assert response.cookies.get("sv_access_token")
    assert response.cookies.get("sv_refresh_token")
    set_cookie_header = response.headers.get("set-cookie", "")
    assert "HttpOnly" in set_cookie_header


def test_auth_me_accepts_cookie_only_session(client: TestClient):
    login_response = client.post(
        "/api/auth/login",
        json={"username": "staff1", "password": "staff123"},
    )
    assert login_response.status_code == 200

    me_response = client.get("/api/auth/me")

    assert me_response.status_code == 200
    payload = me_response.json()
    assert payload["username"] == "staff1"
    assert payload["id"]
    assert payload["is_active"] is True


def test_refresh_accepts_cookie_without_request_body_token(client: TestClient, monkeypatch):
    login_response = client.post(
        "/api/auth/login",
        json={"username": "staff1", "password": "staff123"},
    )
    assert login_response.status_code == 200

    refresh_token = login_response.cookies.get("sv_refresh_token")
    assert refresh_token

    import backend.app_factory as app_factory

    refresh_mock = AsyncMock(
        return_value={
            "access_token": "new-access-token",
            "refresh_token": "new-refresh-token",
            "token_type": "bearer",
            "expires_in": 900,
            "user": {
                "id": "staff1-id",
                "username": "staff1",
                "full_name": "Staff Member",
                "role": "staff",
                "is_active": True,
                "permissions": [],
            },
        }
    )
    monkeypatch.setattr(
        app_factory,
        "get_refresh_token_service",
        lambda: type(
            "_CookieRefreshService",
            (),
            {"refresh_access_token": refresh_mock},
        )(),
    )

    refresh_response = client.post("/api/auth/refresh", json={})

    assert refresh_response.status_code == 200
    payload = refresh_response.json()
    assert payload["success"] is True
    refresh_mock.assert_awaited_once_with(refresh_token)
    assert payload["data"]["access_token"] == "new-access-token"
    assert refresh_response.cookies.get("sv_access_token") == "new-access-token"
    assert refresh_response.cookies.get("sv_refresh_token") == "new-refresh-token"
