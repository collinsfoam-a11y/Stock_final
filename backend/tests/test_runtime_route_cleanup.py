import pytest


@pytest.mark.asyncio
async def test_deprecated_backend_config_routes_are_not_registered(async_client):
    response = await async_client.get("/api/config/backend-info")
    assert response.status_code == 404
