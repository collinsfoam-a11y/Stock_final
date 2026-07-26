from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient


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


@pytest.mark.asyncio
async def test_create_manual_batches_assigns_barcodes_from_500001(
    async_client: AsyncClient, authenticated_headers, test_db
):
    item_code = "MANUAL001"
    await test_db.erp_items.delete_many({"item_code": item_code})

    payload = {
        "item_code": item_code,
        "batches": [
            {"quantity": 5, "mrp": 100, "batch_no": "BATCH-A"},
            {"quantity": 3, "mfg_date": "2026-01-01", "expiry_date": "2027-01-01"},
        ],
    }

    response = await async_client.post(
        "/api/item-batches/manual", json=payload, headers=authenticated_headers
    )

    assert response.status_code == 200, f"Response: {response.text}"
    data = response.json()
    assert data["item_code"] == item_code
    assert len(data["batches"]) == 2
    assert data["next_barcode"] == 500003

    first = data["batches"][0]
    assert first["barcode"] == "500001"
    assert first["batch_no"] == "BATCH-A"
    assert first["stock_qty"] == 5
    assert first["mrp"] == 100
    assert first["synced_from_sql"] is False

    second = data["batches"][1]
    assert second["barcode"] == "500002"
    assert second["batch_no"] == "MANUAL-500002"
    assert second["stock_qty"] == 3
    assert second["manufacturing_date"] == "2026-01-01"
    assert second["expiry_date"] == "2027-01-01"
    assert second["synced_from_sql"] is False

    stored = await test_db.erp_items.find({"item_code": item_code}).to_list(length=10)
    assert len(stored) == 2
    assert {doc["barcode"] for doc in stored} == {"500001", "500002"}


@pytest.mark.asyncio
async def test_create_manual_batches_continues_from_existing_500_barcodes(
    async_client: AsyncClient, authenticated_headers, test_db
):
    item_code = "MANUAL002"
    await test_db.erp_items.delete_many({"item_code": item_code})
    await test_db.erp_items.insert_many(
        [
            {"item_code": item_code, "barcode": "500010", "batch_no": "EXISTING"},
            {"item_code": item_code, "barcode": "500008", "batch_no": "EXISTING-2"},
        ]
    )

    payload = {
        "item_code": item_code,
        "batches": [{"quantity": 1}],
    }

    response = await async_client.post(
        "/api/item-batches/manual", json=payload, headers=authenticated_headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["batches"][0]["barcode"] == "500011"
    assert data["next_barcode"] == 500012


@pytest.mark.asyncio
async def test_create_manual_batches_requires_item_code_and_batches(
    async_client: AsyncClient, authenticated_headers
):
    response = await async_client.post(
        "/api/item-batches/manual",
        json={"batches": [{"quantity": 1}]},
        headers=authenticated_headers,
    )
    assert response.status_code == 400

    response = await async_client.post(
        "/api/item-batches/manual", json={"item_code": "X"}, headers=authenticated_headers
    )
    assert response.status_code == 400
