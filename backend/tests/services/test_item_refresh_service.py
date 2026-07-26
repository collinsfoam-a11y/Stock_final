from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from backend.exceptions import (
    ERPItemNotFoundError,
    ERPRefreshInProgressError,
)
from backend.services.item_refresh_service import ItemRefreshLock, ItemRefreshService


@pytest.mark.asyncio
async def test_resolve_identifier_barcode_batch(test_db):
    svc = ItemRefreshService()
    await test_db.erp_items.insert_one(
        {
            "item_code": "ITEM_BARCODE_1",
            "barcode": "BARCODE_BATCH_1",
            "batch_id": "BATCH_999",
            "stock_qty": 50.0,
        }
    )

    identity = await svc.resolve_identifier("BARCODE_BATCH_1")
    assert identity.requested_identifier == "BARCODE_BATCH_1"
    assert identity.identifier_type == "barcode"
    assert identity.quantity_scope == "batch"
    assert identity.item_code == "ITEM_BARCODE_1"
    assert identity.barcode == "BARCODE_BATCH_1"
    assert identity.batch_id == "BATCH_999"
    assert identity.lock_key == "erp-item-refresh:batch:BATCH_999"


@pytest.mark.asyncio
async def test_resolve_identifier_item_code_total(test_db):
    svc = ItemRefreshService()
    await test_db.erp_items.insert_one(
        {"item_code": "ITEM_CODE_TOTAL_1", "barcode": "BARCODE_TOTAL_1", "stock_qty": 100.0}
    )

    identity = await svc.resolve_identifier("ITEM_CODE_TOTAL_1")
    assert identity.requested_identifier == "ITEM_CODE_TOTAL_1"
    assert identity.identifier_type == "item_code"
    assert identity.quantity_scope == "item_total"
    assert identity.item_code == "ITEM_CODE_TOTAL_1"
    assert identity.lock_key == "erp-item-refresh:item:ITEM_CODE_TOTAL_1"


@pytest.mark.asyncio
async def test_resolve_identifier_not_found(test_db):
    svc = ItemRefreshService()
    with patch("backend.services.item_refresh_service.sql_sync_service") as mock_sql:
        mock_sql.sql_connector.test_connection = MagicMock(return_value=True)
        mock_sql.sql_connector.get_item_by_barcode = MagicMock(return_value=None)
        mock_sql.sql_connector.get_item_by_code = MagicMock(return_value=None)

        with pytest.raises(ERPItemNotFoundError):
            await svc.resolve_identifier("NON_EXISTENT")


@pytest.mark.asyncio
async def test_lock_acquisition_and_release(test_db):
    mock_lock_service = AsyncMock()
    mock_lock_service.acquire_lock = AsyncMock(return_value=True)
    mock_lock_service.release_lock = AsyncMock(return_value=True)

    lock = ItemRefreshLock(mock_lock_service, owner="test-owner")
    async with await lock.acquire(key="test-key", ttl_seconds=15):
        assert lock.key == "test-key"
        mock_lock_service.acquire_lock.assert_awaited_once_with(
            key="test-key", owner="test-owner", ttl_seconds=15
        )

    mock_lock_service.release_lock.assert_awaited_once_with(key="test-key", owner="test-owner")


@pytest.mark.asyncio
async def test_lock_conflict_raises_refresh_in_progress(test_db):
    from backend.services.lock_service import ResourceLockedError

    mock_lock_service = AsyncMock()
    mock_lock_service.acquire_lock = AsyncMock(side_effect=ResourceLockedError("Locked"))

    lock = ItemRefreshLock(mock_lock_service, owner="test-owner")
    with pytest.raises(ERPRefreshInProgressError) as exc_info:
        await lock.acquire(key="test-key")

    assert exc_info.value.retry_after == 2


@pytest.mark.asyncio
async def test_refresh_single_item_changed_delta_response(test_db):
    svc = ItemRefreshService()
    await test_db.erp_items.insert_one(
        {"item_code": "ITEM_REFRESH_DELTA", "barcode": "BAR_DELTA", "stock_qty": 10.0}
    )

    with (
        patch("backend.services.item_refresh_service.sql_sync_service") as mock_sql,
        patch("backend.services.item_refresh_service.cache_service") as mock_cache,
        patch("backend.services.item_refresh_service.audit_service") as mock_audit,
    ):
        mock_sql.sql_connector.test_connection = MagicMock(return_value=True)
        mock_sql.sql_connector.get_item_by_barcode = MagicMock(
            return_value={"item_code": "ITEM_REFRESH_DELTA"}
        )
        mock_sql.sync_single_item_by_barcode = AsyncMock(
            return_value={"item_code": "ITEM_REFRESH_DELTA", "stock_qty": 25.0}
        )
        mock_cache.delete = AsyncMock()
        mock_audit.log_event = AsyncMock()

        res = await svc.refresh_single_item_by_identifier(
            identifier="BAR_DELTA", actor={"username": "test_staff"}, request_id="req-delta-1"
        )

        assert res.success is True
        assert res.item_code == "ITEM_REFRESH_DELTA"
        assert res.previous_qty == 10.0
        assert res.current_qty == 25.0
        assert res.delta == 15.0
        assert res.changed is True
        assert res.baseline_changed is False
        assert res.source == "sql_server"
        mock_audit.log_event.assert_awaited_once()


@pytest.mark.asyncio
async def test_refresh_single_item_unchanged_response(test_db):
    svc = ItemRefreshService()
    await test_db.erp_items.insert_one(
        {"item_code": "ITEM_SAME", "barcode": "BAR_SAME", "stock_qty": 20.0}
    )

    with (
        patch("backend.services.item_refresh_service.sql_sync_service") as mock_sql,
        patch("backend.services.item_refresh_service.cache_service") as mock_cache,
        patch("backend.services.item_refresh_service.audit_service") as mock_audit,
    ):
        mock_sql.sql_connector.test_connection = MagicMock(return_value=True)
        mock_sql.sql_connector.get_item_by_barcode = MagicMock(
            return_value={"item_code": "ITEM_SAME"}
        )
        mock_sql.sync_single_item_by_barcode = AsyncMock(
            return_value={"item_code": "ITEM_SAME", "stock_qty": 20.0}
        )
        mock_cache.delete = AsyncMock()
        mock_audit.log_event = AsyncMock()

        res = await svc.refresh_single_item_by_identifier(
            identifier="BAR_SAME", actor={"username": "test_staff"}, request_id="req-same-1"
        )

        assert res.success is True
        assert res.previous_qty == 20.0
        assert res.current_qty == 20.0
        assert res.delta == 0.0
        assert res.changed is False
        assert res.baseline_changed is False
