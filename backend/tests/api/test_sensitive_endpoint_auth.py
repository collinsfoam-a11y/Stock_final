import pytest

SENSITIVE_ENDPOINTS = [
    ("get", "/api/sync/status"),
    ("get", "/api/sync/stats"),
    ("post", "/api/sync/trigger"),
    ("get", "/api/metrics"),
    ("get", "/api/metrics/json"),
    ("get", "/api/metrics/health"),
    ("get", "/api/metrics/stats"),
    ("get", "/api/metrics/staff-performance"),
    ("get", "/api/permissions/available"),
    ("get", "/api/permissions/roles"),
    ("get", "/api/mapping/test_direct"),
    ("get", "/api/mapping/current"),
]


async def _request(async_client, method: str, path: str, headers: dict[str, str] | None = None):
    return await getattr(async_client, method)(path, headers=headers)


@pytest.mark.asyncio
@pytest.mark.parametrize(("method", "path"), SENSITIVE_ENDPOINTS)
async def test_sensitive_endpoints_reject_anonymous_users(async_client, method, path):
    response = await _request(async_client, method, path)

    assert response.status_code in {401, 403}


@pytest.mark.asyncio
@pytest.mark.parametrize(("method", "path"), SENSITIVE_ENDPOINTS)
async def test_sensitive_endpoints_reject_staff_users(
    async_client, make_auth_headers, method, path
):
    response = await _request(
        async_client,
        method,
        path,
        headers=make_auth_headers("staff1", "staff"),
    )

    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize(("method", "path"), SENSITIVE_ENDPOINTS)
async def test_sensitive_endpoints_allow_admin_users(async_client, make_auth_headers, method, path):
    response = await _request(
        async_client,
        method,
        path,
        headers=make_auth_headers("admin", "admin"),
    )

    assert response.status_code not in {401, 403}
