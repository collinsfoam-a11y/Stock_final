import pytest
from httpx import AsyncClient
from unittest.mock import MagicMock


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
async def test_get_item_batches_groups_same_product_name_with_different_barcodes(
    async_client: AsyncClient, authenticated_headers, test_db
):
    """
    STOCK.xlsx represents batches as same product name with different Auto Barcode.
    Those rows must be shown as one batch family even when item codes differ.
    """
    item_name = "ANCHOR COOLKING 1200MM IVORY"
    await test_db.erp_items.delete_many({"item_name": item_name})

    await test_db.erp_items.insert_many(
        [
            {
                "item_code": "5949",
                "barcode": "515950",
                "autobarcode": "515950",
                "item_name": item_name,
                "batch_no": "515950",
                "stock_qty": 0,
                "mrp": 2750,
                "warehouse": "Main",
            },
            {
                "item_code": "ALT5949",
                "barcode": "521990",
                "autobarcode": "521990",
                "item_name": item_name,
                "batch_no": "521990",
                "stock_qty": 1,
                "mrp": 2750,
                "warehouse": "Main",
            },
        ]
    )

    response = await async_client.get(
        "/api/item-batches/5949", headers=authenticated_headers
    )

    assert response.status_code == 200, f"Response: {response.text}"
    data = response.json()

    assert data["source"] == "mongodb_offline_fallback"
    assert data["total_batches"] == 2
    assert [batch["barcode"] for batch in data["batches"]] == ["521990", "515950"]
    assert {batch["item_code"] for batch in data["batches"]} == {"5949", "ALT5949"}


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

    from backend.api.erp_api import _cache_service, _db, init_erp_api
    init_erp_api(_db, _cache_service, sql_connector)



    try:
        response = await async_client.get(
            f"/api/item-batches/{item_code}", headers=authenticated_headers
        )
    finally:
        init_erp_api(_db, _cache_service, None)




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
