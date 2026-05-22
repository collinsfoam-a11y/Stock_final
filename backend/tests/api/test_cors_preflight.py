from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_cors_preflight_allows_idempotency_header(async_client):
    response = await async_client.options(
        "/api/sessions",
        headers={
            "Origin": "http://192.168.31.108:8081",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type,x-idempotency-key",
        },
    )

    assert response.status_code == 200
    allowed_headers = response.headers.get("access-control-allow-headers", "").lower()
    assert "x-idempotency-key" in allowed_headers
