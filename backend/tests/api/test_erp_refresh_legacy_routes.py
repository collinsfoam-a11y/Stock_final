from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_legacy_route_1_refresh_stock(async_client: AsyncClient, test_db, make_auth_headers):
    headers = make_auth_headers("staff1", "staff")

    await test_db.erp_items.insert_one(
        {"item_code": "LEGACY_1", "barcode": "LEGACY_1", "stock_qty": 10.0}
    )

    with (
        patch("backend.services.item_refresh_service.sql_sync_service") as mock_sql,
        patch("backend.services.item_refresh_service.cache_service") as mock_cache,
    ):
        mock_sql.sql_connector.test_connection = MagicMock(return_value=True)
        mock_sql.sql_connector.get_item_by_code.return_value = {"item_code": "LEGACY_1"}
        mock_sql.sync_single_item_by_code = AsyncMock(
            return_value={"item_code": "LEGACY_1", "stock_qty": 15.0}
        )
        mock_sql.sync_single_item_by_barcode = AsyncMock(
            return_value={"item_code": "LEGACY_1", "stock_qty": 15.0}
        )
        mock_cache.delete = AsyncMock()

        response = await async_client.post("/api/erp/items/LEGACY_1/refresh-stock", headers=headers)

        assert response.status_code == 200
        assert response.headers.get("Deprecation") == "true"
        assert response.headers.get("Sunset") == "2026-10-01"
        assert (
            '</api/v2/erp/items/LEGACY_1/refresh>; rel="successor-version"'
            in response.headers.get("Link", "")
        )

        data = response.json()
        assert data["success"] is True
        assert "Stock refreshed from SQL" in data["message"]


@pytest.mark.asyncio
async def test_legacy_route_2_refresh_sql_qty(
    async_client: AsyncClient, test_db, make_auth_headers
):
    headers = make_auth_headers("staff1", "staff")

    await test_db.erp_items.insert_one(
        {"item_code": "LEGACY_2", "barcode": "BARCODE_LEGACY_2", "stock_qty": 20.0}
    )

    with (
        patch("backend.services.item_refresh_service.sql_sync_service") as mock_sql,
        patch("backend.services.item_refresh_service.cache_service") as mock_cache,
    ):
        mock_sql.sql_connector.test_connection = MagicMock(return_value=True)
        mock_sql.sql_connector.get_item_by_barcode.return_value = {"item_code": "LEGACY_2"}
        mock_sql.sync_single_item_by_barcode = AsyncMock(
            return_value={"item_code": "LEGACY_2", "stock_qty": 35.0}
        )
        mock_cache.delete = AsyncMock()

        response = await async_client.post(
            "/api/v2/erp/items/BARCODE_LEGACY_2/refresh-sql-qty", headers=headers
        )

        assert response.status_code == 200
        assert response.headers.get("Deprecation") == "true"
        assert response.headers.get("Sunset") == "2026-10-01"
        assert (
            '</api/v2/erp/items/LEGACY_2/refresh>; rel="successor-version"'
            in response.headers.get("Link", "")
        )

        data = response.json()
        assert data["success"] is True
        assert data["item"] is not None
        assert data["item"]["item_code"] == "LEGACY_2"
