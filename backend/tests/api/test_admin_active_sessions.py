import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_admin_can_filter_active_sessions_by_other_user(
    async_client: AsyncClient, test_db
):
    """An admin must be able to view another user's active sessions through
    the ``/api/sessions/active`` endpoint."""
    await test_db.sessions.insert_one(
        {
            "id": "sess-admin-1",
            "session_id": "sess-admin-1",
            "status": "ACTIVE",
            "staff_user": "staff1",
            "rack_no": "R1",
            "location_name": "Warehouse",
            "started_at": "2026-01-01T00:00:00Z",
        }
    )
    await test_db.users.insert_one(
        {
            "username": "admin1",
            "role": "admin",
            "is_active": True,
            "has_pin": False,
        }
    )

    from backend.auth.jwt_provider import encode
    import os

    token = encode(
        {"sub": "admin1", "role": "admin"},
        os.getenv("JWT_SECRET", "test-jwt-secret-key-for-testing-only"),
        algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
    )
    admin_headers = {"Authorization": f"Bearer {token}"}

    response = await async_client.get(
        "/api/sessions/active",
        headers=admin_headers,
        params={"user_id": "staff1"},
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert any(session.get("id") == "sess-admin-1" for session in data)
