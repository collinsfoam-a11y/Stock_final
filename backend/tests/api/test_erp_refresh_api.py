from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from backend.exceptions import (
    ERPInvalidResponseError,
    ERPRefreshInProgressError,
    SQLConnectionTimeoutError,
    SQLUnavailableError,
)
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_refresh_api_success(async_client: AsyncClient, test_db, make_auth_headers):
    headers = make_auth_headers("staff1", "staff")
    headers["x-request-id"] = "req-custom-123"

    await test_db.erp_items.insert_one(
        {"item_code": "ITEM_API_1", "barcode": "BARCODE_API_1", "stock_qty": 10.0}
    )

    with (
        patch("backend.services.item_refresh_service.sql_sync_service") as mock_sql,
        patch("backend.services.item_refresh_service.cache_service") as mock_cache,
    ):
        mock_sql.sql_connector.test_connection = MagicMock(return_value=True)
        mock_sql.sql_connector.get_item_by_barcode.return_value = {"item_code": "ITEM_API_1"}
        mock_sql.sync_single_item_by_barcode = AsyncMock(
            return_value={"item_code": "ITEM_API_1", "stock_qty": 25.0}
        )
        mock_cache.delete = AsyncMock()

        response = await async_client.post(
            "/api/v2/erp/items/BARCODE_API_1/refresh", headers=headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["item_code"] == "ITEM_API_1"
        assert data["previous_qty"] == 10.0
        assert data["current_qty"] == 25.0
        assert data["delta"] == 15.0
        assert data["changed"] is True
        assert data["request_id"] == "req-custom-123"


@pytest.mark.asyncio
async def test_refresh_api_unchanged(async_client: AsyncClient, test_db, make_auth_headers):
    headers = make_auth_headers("staff1", "staff")

    await test_db.erp_items.insert_one(
        {"item_code": "ITEM_API_UNCHANGED", "barcode": "BARCODE_UNCHANGED", "stock_qty": 30.0}
    )

    with (
        patch("backend.services.item_refresh_service.sql_sync_service") as mock_sql,
        patch("backend.services.item_refresh_service.cache_service") as mock_cache,
    ):
        mock_sql.sql_connector.test_connection = MagicMock(return_value=True)
        mock_sql.sql_connector.get_item_by_barcode.return_value = {
            "item_code": "ITEM_API_UNCHANGED"
        }
        mock_sql.sync_single_item_by_barcode = AsyncMock(
            return_value={"item_code": "ITEM_API_UNCHANGED", "stock_qty": 30.0}
        )
        mock_cache.delete = AsyncMock()

        response = await async_client.post(
            "/api/v2/erp/items/BARCODE_UNCHANGED/refresh", headers=headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is False
        assert data["delta"] == 0.0


@pytest.mark.asyncio
async def test_refresh_api_404_not_found(async_client: AsyncClient, test_db, make_auth_headers):
    headers = make_auth_headers("staff1", "staff")

    with patch("backend.services.item_refresh_service.sql_sync_service") as mock_sql:
        mock_sql.sql_connector.test_connection = MagicMock(return_value=True)
        mock_sql.sql_connector.get_item_by_barcode.return_value = None
        mock_sql.sql_connector.get_item_by_code.return_value = None

        response = await async_client.post(
            "/api/v2/erp/items/NON_EXISTENT_ITEM/refresh", headers=headers
        )

        assert response.status_code == 404
        data = response.json()
        assert data["error"] == "ERP_ITEM_NOT_FOUND"


@pytest.mark.asyncio
async def test_refresh_api_409_lock_conflict(async_client: AsyncClient, test_db, make_auth_headers):
    headers = make_auth_headers("staff1", "staff")

    await test_db.erp_items.insert_one(
        {"item_code": "ITEM_LOCKED", "barcode": "BARCODE_LOCKED", "stock_qty": 10.0}
    )

    with patch(
        "backend.services.item_refresh_service.ItemRefreshLock.acquire"
    ) as mock_lock_acquire:
        mock_lock_acquire.side_effect = ERPRefreshInProgressError(retry_after=5)

        response = await async_client.post(
            "/api/v2/erp/items/BARCODE_LOCKED/refresh", headers=headers
        )

        assert response.status_code == 409
        assert response.headers.get("Retry-After") == "5"
        data = response.json()
        assert data["error"] == "ERP_REFRESH_IN_PROGRESS"


@pytest.mark.asyncio
async def test_refresh_api_503_sql_unavailable(
    async_client: AsyncClient, test_db, make_auth_headers
):
    headers = make_auth_headers("staff1", "staff")

    await test_db.erp_items.insert_one(
        {"item_code": "ITEM_SQL_DOWN", "barcode": "BARCODE_SQL_DOWN", "stock_qty": 10.0}
    )

    with (
        patch("backend.services.item_refresh_service.ItemRefreshLock.acquire"),
        patch("backend.services.item_refresh_service.sql_sync_service") as mock_sql,
    ):
        mock_sql.sync_single_item_by_barcode = AsyncMock(
            side_effect=SQLUnavailableError("Database unreachable")
        )

        response = await async_client.post(
            "/api/v2/erp/items/BARCODE_SQL_DOWN/refresh", headers=headers
        )

        assert response.status_code == 503
        data = response.json()
        assert data["error"] == "SQL_SERVER_UNAVAILABLE"


@pytest.mark.asyncio
async def test_refresh_api_504_sql_timeout(async_client: AsyncClient, test_db, make_auth_headers):
    headers = make_auth_headers("staff1", "staff")

    await test_db.erp_items.insert_one(
        {"item_code": "ITEM_TIMEOUT", "barcode": "BARCODE_TIMEOUT", "stock_qty": 10.0}
    )

    with (
        patch("backend.services.item_refresh_service.ItemRefreshLock.acquire"),
        patch("backend.services.item_refresh_service.sql_sync_service") as mock_sql,
    ):
        mock_sql.sync_single_item_by_barcode = AsyncMock(
            side_effect=SQLConnectionTimeoutError("Query timed out")
        )

        response = await async_client.post(
            "/api/v2/erp/items/BARCODE_TIMEOUT/refresh", headers=headers
        )

        assert response.status_code == 504
        data = response.json()
        assert data["error"] == "SQL_SERVER_TIMEOUT"


@pytest.mark.asyncio
async def test_refresh_api_502_invalid_response(
    async_client: AsyncClient, test_db, make_auth_headers
):
    headers = make_auth_headers("staff1", "staff")

    await test_db.erp_items.insert_one(
        {"item_code": "ITEM_INVALID", "barcode": "BARCODE_INVALID", "stock_qty": 10.0}
    )

    with (
        patch("backend.services.item_refresh_service.ItemRefreshLock.acquire"),
        patch("backend.services.item_refresh_service.sql_sync_service") as mock_sql,
    ):
        mock_sql.sync_single_item_by_barcode = AsyncMock(
            side_effect=ERPInvalidResponseError("Malformed ERP payload")
        )

        response = await async_client.post(
            "/api/v2/erp/items/BARCODE_INVALID/refresh", headers=headers
        )

        assert response.status_code == 502
        data = response.json()
        assert data["error"] == "ERP_INVALID_RESPONSE"


@pytest.mark.asyncio
async def test_canonical_refresh_route_accepts_post(
    async_client: AsyncClient, test_db, make_auth_headers
):
    headers = make_auth_headers("staff1", "staff")
    response = await async_client.post("/api/v2/erp/items/TEST123/refresh", headers=headers)
    assert response.status_code != 405
