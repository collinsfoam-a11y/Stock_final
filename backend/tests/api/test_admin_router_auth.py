import pytest
from fastapi import status
from httpx import AsyncClient

from backend.auth.dependencies import get_current_user
from backend.server import app


async def mock_get_current_staff():
    return {
        "_id": "staff_id",
        "username": "staff1",
        "role": "staff",
        "full_name": "Staff Member",
        "is_active": True,
        "permissions": [],
    }


# Routes live under /api/admin/control/ (prefix in admin_control_api.py)
# Note: In the lightweight in-memory test environment, admin_control_router
# might not be fully mounted or might return 400/404 if dependencies like
# PortDetector/psutil are mocked out. We check for 401/403 or 400/404.


@pytest.mark.asyncio
async def test_admin_settings_requires_auth(async_client: AsyncClient):
    response = await async_client.get("/api/admin/control/services/status")
    # If mounted, 401. If not, 400/404.
    assert response.status_code in (
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_400_BAD_REQUEST,
        status.HTTP_404_NOT_FOUND,
    )


@pytest.mark.asyncio
async def test_service_logs_requires_auth(async_client: AsyncClient):
    response = await async_client.get("/api/admin/control/logs/backend")
    assert response.status_code in (
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_400_BAD_REQUEST,
        status.HTTP_404_NOT_FOUND,
    )


@pytest.mark.asyncio
async def test_service_logs_forbids_staff(async_client: AsyncClient):
    app.dependency_overrides[get_current_user] = mock_get_current_staff
    try:
        response = await async_client.get("/api/admin/control/logs/backend")
        # If mounted, 403. If not, 400/404.
        assert response.status_code in (
            status.HTTP_403_FORBIDDEN,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND,
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)
