import pytest
from fastapi.testclient import TestClient
from backend.server import app
from backend.tests.utils.in_memory_db import setup_server_with_in_memory_db
from backend.config import settings


@pytest.fixture
def fake_environment(monkeypatch):
    """Provide an isolated in-memory database."""
    db = setup_server_with_in_memory_db(monkeypatch)
    # Ensure SINGLE SESSION is ON for these tests
    monkeypatch.setattr(settings, "AUTH_SINGLE_SESSION", True)

    # Patch 'db' in sql_verification_service module
    import backend.services.sql_verification_service as svs

    monkeypatch.setattr(svs, "db", db)

    return db


@pytest.fixture
def client(fake_environment):
    return TestClient(app)


def get_token(resp, op_name="Op"):
    data = resp.json()
    if resp.status_code >= 400:
        return None
    if "data" in data:
        return data["data"]["access_token"]
    return data["access_token"]


def clear_sessions(db, username):
    """Helper to clear refresh tokens so we can test login after register."""
    db.refresh_tokens._documents = [
        d for d in db.refresh_tokens._documents if d.get("username") != username
    ]


def test_single_session_enforcement(client, fake_environment):
    user = {"username": "user1", "password": "Password123!", "full_name": "User 1", "role": "staff"}
    client.post("/api/auth/register", json=user)

    # Register created a refresh token. Clear it to allow first login.
    clear_sessions(fake_environment, "user1")

    resp1 = client.post("/api/auth/login", json={"username": "user1", "password": "Password123!"})
    assert resp1.status_code == 200

    resp2 = client.post("/api/auth/login", json={"username": "user1", "password": "Password123!"})
    assert resp2.status_code == 200


def test_sql_verification_logic_enforcement(client, fake_environment, monkeypatch):
    user = {
        "username": "user_verify",
        "password": "Password123!",
        "full_name": "User Verify",
        "role": "staff",
    }
    client.post("/api/auth/register", json=user)
    clear_sessions(fake_environment, "user_verify")

    login_resp = client.post(
        "/api/auth/login", json={"username": "user_verify", "password": "Password123!"}
    )
    token = get_token(login_resp, "Login Verify")
    assert token is not None
    headers = {"Authorization": f"Bearer {token}"}

    item_code = "ITEM001"
    fake_environment.erp_items._documents.append(
        {
            "_id": "item001",
            "item_code": item_code,
            "item_name": "Test Item",
            "stock_qty": 10.0,
        }
    )

    from backend.services.sql_verification_service import sql_verification_service
    from unittest.mock import AsyncMock

    monkeypatch.setattr(sql_verification_service, "_get_sql_quantity", AsyncMock(return_value=15.0))

    resp = client.post(f"/api/v2/verification/items/{item_code}/verify-qty", headers=headers)
    assert resp.status_code == 200

    updated_item = next(
        i for i in fake_environment.erp_items._documents if i["item_code"] == item_code
    )
    assert updated_item["sql_verified_qty"] == 15.0


def test_sql_down_behavior_blocked(client, fake_environment, monkeypatch):
    user = {
        "username": "user_down",
        "password": "Password123!",
        "full_name": "User Down",
        "role": "staff",
    }
    client.post("/api/auth/register", json=user)
    clear_sessions(fake_environment, "user_down")

    login_resp = client.post(
        "/api/auth/login", json={"username": "user_down", "password": "Password123!"}
    )
    token = get_token(login_resp, "Login Down")
    assert token is not None
    headers = {"Authorization": f"Bearer {token}"}

    item_code = "ITEM001"
    fake_environment.erp_items._documents.append(
        {"_id": "item001", "item_code": item_code, "item_name": "Test Item", "stock_qty": 10.0}
    )

    from backend.services.sql_verification_service import sql_verification_service
    from unittest.mock import AsyncMock

    monkeypatch.setattr(
        sql_verification_service,
        "_get_sql_quantity",
        AsyncMock(side_effect=Exception("SQL Server Connection Timeout")),
    )

    resp = client.post(f"/api/v2/verification/items/{item_code}/verify-qty", headers=headers)
    assert resp.status_code == 503
    assert "erp system" in str(resp.json()).lower()
