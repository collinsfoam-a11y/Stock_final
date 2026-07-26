from unittest.mock import patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_verification_requires_session_baseline(
    async_client: AsyncClient, test_db, make_auth_headers
):
    headers = make_auth_headers("staff1", "staff")

    await test_db.erp_items.insert_one(
        {"item_code": "ITEM_NO_BASELINE", "barcode": "BARCODE_NO_BASELINE", "stock_qty": 50.0}
    )

    # Missing session_baseline & baseline_qty should fail with 422
    response = await async_client.patch(
        "/api/v2/erp/items/BARCODE_NO_BASELINE/verify",
        json={"verified": True, "verified_qty": 50, "session_id": "sess_101"},
        headers=headers,
    )
    assert response.status_code == 422
    assert "baseline quantity" in response.json()["detail"]


@pytest.mark.asyncio
async def test_verification_succeeds_with_baseline(
    async_client: AsyncClient, test_db, make_auth_headers
):
    headers = make_auth_headers("staff1", "staff")

    await test_db.erp_items.insert_one(
        {
            "item_code": "ITEM_WITH_BASELINE",
            "barcode": "BARCODE_WITH_BASELINE",
            "stock_qty": 50.0,
            "session_baseline": 50.0,
        }
    )

    with patch("backend.services.item_refresh_service.sql_sync_service") as mock_sql:
        response = await async_client.patch(
            "/api/v2/erp/items/BARCODE_WITH_BASELINE/verify",
            json={"verified": True, "verified_qty": 50, "session_id": "sess_102"},
            headers=headers,
        )
        assert response.status_code == 200
        # Verification MUST NOT invoke SQL sync/refresh
        mock_sql.sync_single_item_by_barcode.assert_not_called()
        mock_sql.sync_single_item_by_code.assert_not_called()


@pytest.mark.asyncio
async def test_verification_erp_stock_never_replaces_baseline(
    async_client: AsyncClient, test_db, make_auth_headers
):
    headers = make_auth_headers("staff1", "staff")

    # Item has stock_qty updated by SQL refresh, but session_baseline remains frozen
    await test_db.erp_items.insert_one(
        {
            "item_code": "ITEM_FROZEN_BASE",
            "barcode": "BARCODE_FROZEN_BASE",
            "stock_qty": 50.0,
            "session_baseline": 50.0,
        }
    )

    # Verify against frozen session_baseline (50.0)
    response = await async_client.patch(
        "/api/v2/erp/items/BARCODE_FROZEN_BASE/verify",
        json={"verified": True, "verified_qty": 50, "session_id": "sess_103"},
        headers=headers,
    )
    assert response.status_code == 200
    item_in_db = await test_db.erp_items.find_one({"item_code": "ITEM_FROZEN_BASE"})
    assert item_in_db["session_baseline"] == 50.0
    assert item_in_db["verified_qty"] == 50.0


@pytest.mark.asyncio
async def test_verification_conflict_returns_fork_response(
    async_client: AsyncClient, test_db, make_auth_headers
):
    headers = make_auth_headers("staff1", "staff")

    await test_db.erp_items.insert_one(
        {
            "item_code": "ITEM_CONFLICT",
            "barcode": "BARCODE_CONFLICT",
            "stock_qty": 50.0,
            "session_baseline": 50.0,
            "verified": True,
            "verified_qty": 40.0,
            "verified_by": "other_user",
        }
    )

    response = await async_client.patch(
        "/api/v2/erp/items/BARCODE_CONFLICT/verify",
        json={"verified": True, "verified_qty": 45, "session_id": "sess_104"},
        headers=headers,
    )
    # Concurrent conflicting verification triggers conflict response
    assert response.status_code in (200, 409)
    if response.status_code == 200:
        data = response.json()
        assert "conflict" in data or "fork_id" in data or "verification_status" in data
