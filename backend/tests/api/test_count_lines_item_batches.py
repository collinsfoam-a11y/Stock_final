from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient

from backend.api.count_lines_routes import router as count_lines_router


@pytest.mark.asyncio
async def test_count_lines_item_batches_offline_fallback(
    async_client: AsyncClient, authenticated_headers, test_db
):
    item_code = "COUNT-BATCH-001"

    await test_db.erp_items.delete_many({"item_code": item_code})
    await test_db.erp_items.insert_many(
        [
            {
                "item_code": item_code,
                "barcode": "910001",
                "item_name": "Count Batch 1",
                "batch_no": "B1",
                "stock_qty": 7,
                "mrp": 50,
            },
            {
                "item_code": item_code,
                "barcode": "910002",
                "item_name": "Count Batch 2",
                "batch_no": "B2",
                "stock_qty": 11,
                "mrp": 60,
            },
        ]
    )

    response = await async_client.get(
        f"/api/count-lines/item-batches/{item_code}",
        headers=authenticated_headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source"] == "mongodb_offline_fallback"
    assert [batch["batch_no"] for batch in body["batches"]] == ["B2", "B1"]


@pytest.mark.asyncio
async def test_count_lines_item_batches_sql_path(
    async_client: AsyncClient, authenticated_headers
):
    item_code = "COUNT-BATCH-SQL-001"
    sql_batches = [
        {
            "batch_id": "2",
            "batch_no": "C20",
            "auto_barcode": "920002",
            "stock_qty": 2,
            "mrp": 125,
            "item_code": item_code,
            "item_name": "Count SQL Item",
        },
        {
            "batch_id": "1",
            "batch_no": "C10",
            "barcode": "920001",
            "stock_qty": 9,
            "mrp": 130,
            "item_code": item_code,
            "item_name": "Count SQL Item",
        },
    ]

    sql_connector = MagicMock()
    sql_connector.connection = object()
    sql_connector.get_item_batches.return_value = sql_batches

    had_existing = hasattr(count_lines_router, "sql_connector")
    existing_connector = getattr(count_lines_router, "sql_connector", None)
    count_lines_router.sql_connector = sql_connector

    try:
        response = await async_client.get(
            f"/api/count-lines/item-batches/{item_code}",
            headers=authenticated_headers,
        )
    finally:
        if had_existing:
            count_lines_router.sql_connector = existing_connector
        else:
            delattr(count_lines_router, "sql_connector")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source"] == "sql_server"
    assert [batch["batch_no"] for batch in body["batches"]] == ["C10", "C20"]
    assert body["batches"][1]["barcode"] == "920002"
    sql_connector.get_item_batches.assert_called_once_with(item_code)
