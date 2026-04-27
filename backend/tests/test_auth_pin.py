import pytest  # type: ignore
from httpx import AsyncClient  # type: ignore


@pytest.mark.asyncio
async def test_pin_login_success(async_client: AsyncClient):
    """
    Verify 'staff1' login with CORRECT PIN '1234'.
    """
    payload = {"username": "staff1", "pin": "1234", "device_id": "test_device_001"}
    response = await async_client.post("/api/auth/login-pin", json=payload)

    if response.status_code != 200:
        # If it fails, print response to debug
        print(f"Login failed: {response.text}")

    assert response.status_code == 200
    json_response = response.json()
    # Handle ApiResponse wrapper if present
    data = json_response.get("data", json_response)

    assert "access_token" in data
    assert data["user"]["username"] == "staff1"


@pytest.mark.asyncio
async def test_pin_login_failure_rate_limit(async_client: AsyncClient):
    """
    Verify rate limiting acts on WRONG PIN.
    This might require multiple attempts to trigger 429,
    but mainly we want to ensure 401/400 for wrong pin first.
    """
    payload = {
        "pin": "0000",  # Wrong PIN
        "device_id": "test_device_002",
    }

    response = await async_client.post("/api/auth/login-pin", json=payload)

    assert response.status_code in [400, 401, 429]


@pytest.mark.asyncio
async def test_pin_login_requires_username_code(async_client: AsyncClient):
    """Missing username should return a stable code the frontend can match."""
    response = await async_client.post(
        "/api/auth/login-pin",
        json={"pin": "1234", "device_id": "test_device_003"},
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["detail"]["code"] == "USERNAME_REQUIRED_FOR_PIN_LOGIN"
    assert payload["detail"]["error"] == "USERNAME_REQUIRED_FOR_PIN_LOGIN"
    assert payload["detail"]["fields"]["username"] == "Username is required for PIN login."
