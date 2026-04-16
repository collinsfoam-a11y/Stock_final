import pytest
from httpx import AsyncClient
from unittest.mock import MagicMock

from backend.api.erp_api import router as erp_router


@pytest.mark.asyncio
async def test_get_item_batches_offline_fallback(
    async_client: AsyncClient, authenticated_headers, test_db
):
    """
    Test that /api/item-batches falls back to MongoDB when SQL is offline.
    """
    item_code = "TEST001"

    # 1. Insert mock items using the test_db fixture
    await test_db.erp_items.delete_many({"item_code": item_code})

    await test_db.erp_items.insert_many(
        [
            {
                "item_code": item_code,
                "barcode": "510001",
                "item_name": "Test Item Batch 1",
                "batch_no": "B1",
                "stock_qty": 10,
                "mrp": 90,
                "warehouse": "WH1",
            },
            {
                "item_code": item_code,
                "barcode": "510002",
                "item_name": "Test Item Batch 2",
                "batch_no": "B2",
                "stock_qty": 5,
                "mrp": 100,
                "warehouse": "WH1",
            },
            {
                "item_code": item_code,
                "barcode": "510003",
                "item_name": "Test Item Batch 3",
                "batch_no": "B3",
                "stock_qty": 10,
                "warehouse": "WH1",
            },
        ]
    )

    # 2. Call the endpoint
    response = await async_client.get(
        f"/api/item-batches/{item_code}", headers=authenticated_headers
    )

    # 3. Verify response
    assert response.status_code == 200, f"Response: {response.text}"
    data = response.json()

    assert "batches" in data
    assert len(data["batches"]) == 3
    assert data["source"] == "mongodb_offline_fallback"

    # Sorted by stock desc; tie-breaker by batch_no asc
    assert [b["batch_no"] for b in data["batches"]] == ["B1", "B3", "B2"]
    assert [b["stock_qty"] for b in data["batches"]] == [10, 10, 5]
    assert all("mrp" in batch for batch in data["batches"])
    assert data["batches"][0]["mrp"] == 90
    assert data["batches"][1]["mrp"] is None


@pytest.mark.asyncio
async def test_get_item_batches_sql_path_includes_mrp_and_sorts(
    async_client: AsyncClient, authenticated_headers
):
    item_code = "SQL001"
    sql_batches = [
        {
            "batch_id": "2",
            "batch_no": "B20",
            "barcode": "",
            "auto_barcode": "520002",
            "stock_qty": 4,
            "mrp": 120,
            "item_code": item_code,
            "item_name": "SQL Item",
        },
        {
            "batch_id": "1",
            "batch_no": "B10",
            "barcode": "520001",
            "auto_barcode": "520001AUTO",
            "stock_qty": 15,
            "mrp": 130,
            "item_code": item_code,
            "item_name": "SQL Item",
        },
    ]

    sql_connector = MagicMock()
    sql_connector.connection = object()
    sql_connector.get_item_batches.return_value = sql_batches

    had_existing = hasattr(erp_router, "sql_connector")
    existing_connector = getattr(erp_router, "sql_connector", None)
    erp_router.sql_connector = sql_connector

    try:
        response = await async_client.get(
            f"/api/item-batches/{item_code}", headers=authenticated_headers
        )
    finally:
        if had_existing:
            erp_router.sql_connector = existing_connector
        else:
            delattr(erp_router, "sql_connector")

    assert response.status_code == 200, f"Response: {response.text}"
    data = response.json()
    assert data["source"] == "sql_server"
    assert [b["batch_no"] for b in data["batches"]] == ["B10", "B20"]
    assert [b["stock_qty"] for b in data["batches"]] == [15, 4]
    assert data["batches"][0]["barcode"] == "520001"
    assert data["batches"][1]["barcode"] == "520002"
    assert all("mrp" in batch for batch in data["batches"])
    sql_connector.get_item_batches.assert_called_once_with(item_code)


@pytest.mark.asyncio
async def test_get_item_batches_empty(async_client: AsyncClient, authenticated_headers):
    response = await async_client.get(
        "/api/item-batches/NONEXISTENT", headers=authenticated_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["batches"] == []
    assert data["source"] == "mongodb_offline_fallback"
