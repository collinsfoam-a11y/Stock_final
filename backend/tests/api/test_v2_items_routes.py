from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from backend.api.v2 import items
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient


def _build_app(fake_db):
    app = FastAPI()
    app.dependency_overrides[items.get_current_user] = lambda: {"username": "tester"}
    app.include_router(items.router, prefix="/api/v2/items")
    return app


def _item_doc(**overrides):
    doc = {
        "_id": "507f1f77bcf86cd799439011",
        "item_code": "1",
        "barcode": "510001",
        "item_name": "SAGARA WOOD CHATTAKAM W/H 2",
        "stock_qty": 3.0,
        "mrp": 12.5,
    }
    doc.update(overrides)
    return doc


@pytest.mark.asyncio
async def test_item_details_accepts_numeric_barcode_without_object_id_parsing(monkeypatch):
    fake_db = SimpleNamespace(
        erp_items=SimpleNamespace(find_one=AsyncMock(return_value=_item_doc()))
    )
    monkeypatch.setattr(items, "get_db", lambda: fake_db)

    async with AsyncClient(
        transport=ASGITransport(app=_build_app(fake_db)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v2/items/510001")

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["item_code"] == "1"
    assert body["data"]["barcode"] == "510001"
    # Deterministic staged lookup resolves on the item_code match first and never
    # parses the numeric value as an ObjectId.
    fake_db.erp_items.find_one.assert_awaited_once_with({"item_code": "510001"})


@pytest.mark.asyncio
async def test_item_details_uses_canonical_item_code_for_sql_verification(monkeypatch):
    fake_db = SimpleNamespace(
        erp_items=SimpleNamespace(find_one=AsyncMock(return_value=_item_doc()))
    )
    verify_item_quantity = AsyncMock(return_value={"success": False})

    monkeypatch.setattr(items, "get_db", lambda: fake_db)
    monkeypatch.setattr(
        items.sql_verification_service,
        "verify_item_quantity",
        verify_item_quantity,
    )

    async with AsyncClient(
        transport=ASGITransport(app=_build_app(fake_db)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v2/items/510001?verify_sql=true")

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    verify_item_quantity.assert_awaited_once_with("1")
