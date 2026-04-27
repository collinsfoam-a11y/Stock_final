from unittest.mock import AsyncMock

import pytest


@pytest.mark.asyncio
async def test_verify_qty_internal_errors_do_not_leak_exception_detail(
    async_client,
    authenticated_headers,
    monkeypatch,
):
    from backend.api import sql_verification_api

    monkeypatch.setattr(
        sql_verification_api.sql_verification_service,
        "verify_item_quantity",
        AsyncMock(side_effect=RuntimeError("db-prod timeout at 10.4.5.6")),
    )

    response = await async_client.post(
        "/api/v2/verification/items/ITEM-SECURE/verify-qty",
        headers=authenticated_headers,
    )

    assert response.status_code == 500
    assert response.json() == {
        "detail": {
            "code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred while verifying this item.",
        }
    }
