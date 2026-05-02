import pytest
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
    respx.get(f"{settings.PI_SERVER_URL}/models").respond(status_code=200, json={"models": []})

    response = client.get("/api/pi/status")
    assert response.status_code == 200
    assert response.json()["active"] is True
    app.dependency_overrides.clear()


@pytest.mark.asyncio
@respx.mock
async def test_pi_status_offline():
    """Test the status endpoint when pi-server is unreachable."""
    app.dependency_overrides[get_current_user] = get_mock_admin
    respx.get(f"{settings.PI_SERVER_URL}/models").mock(side_effect=Exception("Connection error"))

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
async def test_pi_chat_success():
    """Test successful proxying of chat requests."""
    app.dependency_overrides[get_current_user] = get_mock_admin
    respx.post(f"{settings.PI_SERVER_URL}/chat/completions").respond(
        status_code=200, json={"choices": [{"message": {"content": "Hello world"}}]}
    )

    response = client.post("/api/pi/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert response.status_code == 200
    assert "choices" in response.json()
    app.dependency_overrides.clear()
