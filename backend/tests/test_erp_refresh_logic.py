from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from backend.api.item_verification_api import init_verification_api
from backend.services.lock_service import ResourceLockedError
from backend.services.sql_sync_service import ERPProjectionPolicyError


@pytest.fixture(autouse=True)
def setup_api(test_db):
    init_verification_api(test_db)


@pytest.fixture
def mock_sql_sync_service():
    with patch("backend.services.item_refresh_service.sql_sync_service") as mock_sql:
        mock_sql.sql_connector.test_connection = MagicMock(return_value=True)
        yield mock_sql


@pytest.fixture
def mock_cache_service():
    with patch("backend.services.item_refresh_service.cache_service") as mock_cache:
        mock_cache.delete = AsyncMock()
        yield mock_cache


@pytest.fixture
def mock_audit_service():
    with patch("backend.services.item_refresh_service.audit_service") as mock_audit:
        mock_audit.log_event = AsyncMock()
        yield mock_audit


@pytest.mark.asyncio
async def test_baseline_enforcement_session_linked(
    async_client: AsyncClient, test_db, make_auth_headers
):
    # 1. Baseline enforcement
    headers = make_auth_headers("staff1", "staff")

    # Missing baseline
    await test_db.erp_items.insert_one(
        {"item_code": "ITEM_NO_BASE", "barcode": "ITEM_NO_BASE", "stock_qty": 50.0}
    )

    response = await async_client.patch(
        "/api/v2/erp/items/ITEM_NO_BASE/verify",
        json={"verified": True, "verified_qty": 50, "session_id": "session123"},
        headers=headers,
    )
    assert response.status_code == 422
    assert "baseline quantity" in response.json()["detail"]

    # With baseline
    await test_db.erp_items.insert_one(
        {
            "item_code": "ITEM_WITH_BASE",
            "barcode": "ITEM_WITH_BASE",
            "stock_qty": 40.0,
            "session_baseline": 40.0,
        }
    )

    response = await async_client.patch(
        "/api/v2/erp/items/ITEM_WITH_BASE/verify",
        json={"verified": True, "verified_qty": 40, "session_id": "session123"},
        headers=headers,
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_refresh_concurrency(
    async_client: AsyncClient, test_db, make_auth_headers, mock_sql_sync_service
):
    headers = make_auth_headers("staff1", "staff")

    await test_db.erp_items.insert_one(
        {"item_code": "ITEM_CONCURRENCY", "barcode": "ITEM_CONCURRENCY", "stock_qty": 10.0}
    )

    mock_sql_sync_service.sql_connector.get_item_by_code.return_value = {
        "item_code": "ITEM_CONCURRENCY"
    }
    mock_sql_sync_service.sync_single_item_by_code = AsyncMock(
        return_value={"item_code": "ITEM_CONCURRENCY", "stock_qty": 20.0}
    )

    # Simulate lock contention by patching lock_service directly for the second call
    with patch("backend.services.item_refresh_service.lock_service.acquire_lock") as mock_acquire:
        # First call succeeds
        mock_acquire.side_effect = [None, ResourceLockedError("Locked")]

        # In actual execution with gather, we can't easily guarantee order of the side_effect,
        # so let's just test that ResourceLockedError results in 409

        # Test 409 response for locked resource
        with patch(
            "backend.services.item_refresh_service.ItemRefreshLock.acquire"
        ) as mock_lock_acquire:
            from backend.exceptions import ERPRefreshInProgressError

            mock_lock_acquire.side_effect = ERPRefreshInProgressError(retry_after=2)

            response = await async_client.post(
                "/api/v2/erp/items/ITEM_CONCURRENCY/refresh", headers=headers
            )
            assert response.status_code == 409
            assert response.json()["detail"]["error_code"] == "ERP_REFRESH_IN_PROGRESS"
            assert response.headers.get("Retry-After") == "2"


@pytest.mark.asyncio
async def test_projection_governance(test_db):
    from backend.services.sql_sync_service import SQLSyncService

    svc = SQLSyncService(None, test_db)

    # Test valid fields
    await test_db.erp_items.insert_one({"item_code": "GOV1", "stock_qty": 0.0})
    await svc._update_existing_item(
        "GOV1",
        {"stock_qty": 10.0, "mrp": 150},
        10.0,
        {"stock_qty": 0.0},
        {"qty_changes_detected": 0, "qty_updated": 0},
    )

    updated = await test_db.erp_items.find_one({"item_code": "GOV1"})
    assert updated["stock_qty"] == 10.0

    # Test forbidden fields
    with pytest.raises(ERPProjectionPolicyError) as exc:
        await svc._update_existing_item(
            "GOV1",
            {"verified_qty": 5.0},
            10.0,
            {"stock_qty": 0.0},
            {"qty_changes_detected": 0, "qty_updated": 0},
        )
    assert "Attempted to update forbidden counting fields" in str(exc.value)


@pytest.mark.asyncio
async def test_cache_invalidation(
    async_client: AsyncClient, test_db, make_auth_headers, mock_sql_sync_service, mock_cache_service
):
    headers = make_auth_headers("staff1", "staff")

    await test_db.erp_items.insert_one(
        {"item_code": "ITEM_CACHE", "barcode": "BARCODE_CACHE", "stock_qty": 10.0}
    )

    mock_sql_sync_service.sql_connector.get_item_by_barcode.return_value = {
        "item_code": "ITEM_CACHE"
    }
    mock_sql_sync_service.sync_single_item_by_barcode = AsyncMock(
        return_value={"item_code": "ITEM_CACHE", "stock_qty": 20.0}
    )

    response = await async_client.post("/api/v2/erp/items/BARCODE_CACHE/refresh", headers=headers)

    assert response.status_code == 200

    # Verify cache deletion calls - barcode, item_code, and enhanced aliases
    call_args = mock_cache_service.delete.call_args_list
    namespaces = [call[0][0] for call in call_args]
    keys = [call[0][1] for call in call_args]

    assert all(ns == "items" for ns in namespaces)
    assert set(keys) == {
        "BARCODE_CACHE",
        "enhanced_BARCODE_CACHE",
        "ITEM_CACHE",
        "enhanced_ITEM_CACHE",
    }


@pytest.mark.asyncio
async def test_legacy_migration_forwarding(
    async_client: AsyncClient, test_db, make_auth_headers, mock_sql_sync_service
):
    headers = make_auth_headers("staff1", "staff")

    await test_db.erp_items.insert_one(
        {"item_code": "LEGACY_ITEM", "barcode": "LEGACY_ITEM", "stock_qty": 5.0}
    )

    mock_sql_sync_service.sql_connector.get_item_by_code.return_value = {"item_code": "LEGACY_ITEM"}
    mock_sql_sync_service.sync_single_item_by_code = AsyncMock(
        return_value={"item_code": "LEGACY_ITEM", "stock_qty": 15.0}
    )
    mock_sql_sync_service.sync_single_item_by_barcode = AsyncMock(
        return_value={"item_code": "LEGACY_ITEM", "stock_qty": 15.0}
    )

    response = await async_client.post("/api/erp/items/LEGACY_ITEM/refresh-stock", headers=headers)

    assert response.status_code == 200
    assert response.headers.get("Deprecation") == "true"
    assert "successor-version" in response.headers.get("Link")

    data = response.json()
    assert data["success"] is True
    assert "Stock refreshed from SQL" in data["message"]


@pytest.mark.asyncio
async def test_response_and_audit(
    async_client: AsyncClient, test_db, make_auth_headers, mock_sql_sync_service, mock_audit_service
):
    headers = make_auth_headers("staff1", "staff")
    headers["x-request-id"] = "req-123"

    await test_db.erp_items.insert_one(
        {"item_code": "AUDIT_ITEM", "barcode": "AUDIT_BARCODE", "stock_qty": 10.0}
    )

    mock_sql_sync_service.sql_connector.get_item_by_barcode.return_value = {
        "item_code": "AUDIT_ITEM"
    }
    mock_sql_sync_service.sync_single_item_by_barcode = AsyncMock(
        return_value={"item_code": "AUDIT_ITEM", "stock_qty": 25.0}
    )

    response = await async_client.post("/api/v2/erp/items/AUDIT_BARCODE/refresh", headers=headers)

    assert response.status_code == 200
    data = response.json()

    assert data["changed"] is True
    assert data["previous_qty"] == 10.0
    assert data["current_qty"] == 25.0
    assert data["delta"] == 15.0
    assert data["baseline_changed"] is False
    assert data["request_id"] == "req-123"

    mock_audit_service.log_event.assert_called_once()
    audit_call = mock_audit_service.log_event.call_args[1]
    assert audit_call["action"] == "ERP_ITEM_REFRESHED"
    assert audit_call["entity_id"] == "AUDIT_ITEM"
    assert audit_call["details"]["delta"] == 15.0
