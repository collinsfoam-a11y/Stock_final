import pytest
import httpx
from fastapi.testclient import TestClient
from backend.server import app
from backend.auth.dependencies import get_current_user
from backend.config import settings

respx = pytest.importorskip("respx")


# Mock user for testing
def get_mock_admin():
    return {"username": "admin", "role": "admin"}


def get_mock_staff():
    return {"username": "staff", "role": "staff"}


client = TestClient(app)


@pytest.mark.asyncio
@respx.mock
async def test_pi_status_online():
    """Test the status endpoint when pi-server is reachable."""
    app.dependency_overrides[get_current_user] = get_mock_admin

    def handler(request):
        if settings.PI_SERVER_API_KEY:
            assert request.headers["authorization"] == f"Bearer {settings.PI_SERVER_API_KEY}"
        else:
            assert "authorization" not in request.headers
        return httpx.Response(status_code=200, json={"models": []})

    respx.get(f"{settings.PI_SERVER_URL}/models").mock(side_effect=handler)

    response = client.get("/api/pi/status")
    assert response.status_code == 200
    assert response.json()["active"] is True
    app.dependency_overrides.clear()


@pytest.mark.asyncio
@respx.mock
async def test_pi_status_without_api_key_uses_unauthenticated_mode(monkeypatch):
    """Pi sidecar remains usable when no optional API key is configured."""
    from backend.api import pi_api

    app.dependency_overrides[get_current_user] = get_mock_admin
    monkeypatch.setattr(settings, "PI_SERVER_API_KEY", None)
    monkeypatch.setattr(pi_api, "_PI_AUTH_WARNING_EMITTED", False)

    def handler(request):
        assert "authorization" not in request.headers
        return httpx.Response(status_code=200, json={"models": []})

    respx.get(f"{settings.PI_SERVER_URL}/models").mock(side_effect=handler)

    response = client.get("/api/pi/status")

    assert response.status_code == 200
    assert response.json()["active"] is True
    assert pi_api._PI_AUTH_WARNING_EMITTED is True
    app.dependency_overrides.clear()


@pytest.mark.asyncio
@respx.mock
async def test_pi_status_offline():
    """Test the status endpoint when pi-server is unreachable."""
    app.dependency_overrides[get_current_user] = get_mock_admin
    respx.get(f"{settings.PI_SERVER_URL}/models").mock(
        side_effect=httpx.ConnectError("Connection error")
    )

    response = client.get("/api/pi/status")
    assert response.status_code == 200
    assert response.json()["active"] is False
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_pi_chat_permission_denied():
    """Test that non-admin/non-supervisor users are denied access."""
    app.dependency_overrides[get_current_user] = get_mock_staff

    response = client.post("/api/pi/chat", json={"messages": []})
    assert response.status_code == 403
    app.dependency_overrides.clear()


@pytest.mark.asyncio
@respx.mock
async def test_pi_chat_success(test_db):
    """Test successful proxying of chat requests."""
    app.dependency_overrides[get_current_user] = get_mock_admin

    def handler(request):
        if settings.PI_SERVER_API_KEY:
            assert request.headers["authorization"] == f"Bearer {settings.PI_SERVER_API_KEY}"
        else:
            assert "authorization" not in request.headers
        return httpx.Response(
            status_code=200,
            json={"choices": [{"message": {"content": "Hello world"}}]},
        )

    respx.post(f"{settings.PI_SERVER_URL}/chat/completions").mock(side_effect=handler)

    response = client.post("/api/pi/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert response.status_code == 200
    assert "choices" in response.json()
    history = await test_db.chat_history.find_one({"username": "admin"})
    assert history["user_message"] == "hi"
    assert history["assistant_response"] == "Hello world"
    app.dependency_overrides.clear()
