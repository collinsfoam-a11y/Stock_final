import asyncio
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
    assert body["data"]["sql_verification_in_progress"] is True
    assert body["data"]["stock_qty"] == 33.0
    assert body["data"]["quantity_source"] == "sync_cache"


from datetime import datetime, timedelta, timezone

import pytest


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
        "stock_qty": 33.0,
        "mrp": 12.5,
    }
    doc.update(overrides)
    return doc


@pytest.mark.asyncio
async def test_item_details_verify_sql_false_returns_cached_qty(monkeypatch):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    fake_db = SimpleNamespace(
        erp_items=SimpleNamespace(find_one=AsyncMock(return_value=_item_doc(last_synced=now)))
    )
    monkeypatch.setattr(items, "get_db", lambda: fake_db)

    async with AsyncClient(
        transport=ASGITransport(app=_build_app(fake_db)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v2/items/510001?verify_sql=false")

    body = response.json()
    assert response.status_code == 200
    assert body["data"]["stock_qty"] == 33.0
    assert body["data"]["quantity_source"] == "sync_cache"
    assert body["data"]["sync_stale"] is False


@pytest.mark.asyncio
async def test_item_details_verify_sql_true_returns_cached_qty_immediately(monkeypatch):
    old_time = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=14)
    fake_db = SimpleNamespace(
        erp_items=SimpleNamespace(find_one=AsyncMock(return_value=_item_doc(last_synced=old_time)))
    )
    verify_item_quantity = AsyncMock(return_value={"success": True})

    captured = []

    def _create_task(coro):
        task = asyncio.get_running_loop().create_task(coro)
        captured.append(task)
        return task

    monkeypatch.setattr(items, "get_db", lambda: fake_db)
    monkeypatch.setattr(
        items.sql_verification_service, "verify_item_quantity", verify_item_quantity
    )
    monkeypatch.setattr(asyncio, "create_task", _create_task)

    async with AsyncClient(
        transport=ASGITransport(app=_build_app(fake_db)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v2/items/510001?verify_sql=true")

    body = response.json()
    assert response.status_code == 200
    assert body["data"]["stock_qty"] == 33.0
    assert body["data"]["cached_stock_qty"] == 33.0
    assert body["data"]["quantity_source"] == "sync_cache"
    assert body["data"]["sql_verification_in_progress"] is True
    assert body["data"]["sync_stale"] is True

    await asyncio.gather(*captured, return_exceptions=True)
    verify_item_quantity.assert_awaited_once_with("1")


@pytest.mark.asyncio
async def test_item_details_sql_verification_failure_falls_back_to_cached(monkeypatch):
    old_time = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=14)
    fake_db = SimpleNamespace(
        erp_items=SimpleNamespace(find_one=AsyncMock(return_value=_item_doc(last_synced=old_time)))
    )
    # Verification fails, so sql_verified_qty is NOT present or updated
    verify_item_quantity = AsyncMock(return_value={"success": False})

    captured = []

    def _create_task(coro):
        task = asyncio.get_running_loop().create_task(coro)
        captured.append(task)
        return task

    monkeypatch.setattr(items, "get_db", lambda: fake_db)
    monkeypatch.setattr(
        items.sql_verification_service, "verify_item_quantity", verify_item_quantity
    )
    monkeypatch.setattr(asyncio, "create_task", _create_task)

    async with AsyncClient(
        transport=ASGITransport(app=_build_app(fake_db)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v2/items/510001?verify_sql=true")

    body = response.json()
    assert response.status_code == 200
    assert body["data"]["stock_qty"] == 33.0
    assert body["data"]["cached_stock_qty"] == 33.0
    assert body["data"]["quantity_source"] == "sync_cache"
    assert body["data"]["sql_verification_in_progress"] is True

    await asyncio.gather(*captured, return_exceptions=True)
    verify_item_quantity.assert_awaited_once_with("1")


@pytest.mark.asyncio
async def test_item_details_cache_invalidation_after_successful_verification(monkeypatch):
    old_time = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=14)
    fake_db = SimpleNamespace(
        erp_items=SimpleNamespace(find_one=AsyncMock(return_value=_item_doc(last_synced=old_time)))
    )
    verify_item_quantity = AsyncMock(return_value={"success": True})

    mock_cache_service = SimpleNamespace(delete=AsyncMock(), clear_pattern=AsyncMock())

    captured = []

    def _create_task(coro):
        task = asyncio.get_running_loop().create_task(coro)
        captured.append(task)
        return task

    monkeypatch.setattr(items, "get_db", lambda: fake_db)
    monkeypatch.setattr(
        items.sql_verification_service, "verify_item_quantity", verify_item_quantity
    )
    monkeypatch.setattr("backend.api.v2.items.cache_service", mock_cache_service, raising=False)
    monkeypatch.setattr("backend.core.globals.cache_service", mock_cache_service, raising=False)
    monkeypatch.setattr(asyncio, "create_task", _create_task)

    async with AsyncClient(
        transport=ASGITransport(app=_build_app(fake_db)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v2/items/510001?verify_sql=true")

    body = response.json()
    assert response.status_code == 200
    assert body["data"]["sql_verification_in_progress"] is True
    assert body["data"]["sql_available"] is None

    await asyncio.gather(*captured, return_exceptions=True)
    assert mock_cache_service.delete.await_count >= 1
    mock_cache_service.clear_pattern.assert_awaited_with("search:*")


@pytest.mark.asyncio
async def test_item_details_sql_verification_failure_sql_available_none(monkeypatch):
    old_time = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=14)
    fake_db = SimpleNamespace(
        erp_items=SimpleNamespace(find_one=AsyncMock(return_value=_item_doc(last_synced=old_time)))
    )
    # Verification fails, simulating SQL offline
    verify_item_quantity = AsyncMock(return_value={"success": False})

    captured = []

    def _create_task(coro):
        task = asyncio.get_running_loop().create_task(coro)
        captured.append(task)
        return task

    monkeypatch.setattr(items, "get_db", lambda: fake_db)
    monkeypatch.setattr(
        items.sql_verification_service, "verify_item_quantity", verify_item_quantity
    )
    monkeypatch.setattr(asyncio, "create_task", _create_task)

    async with AsyncClient(
        transport=ASGITransport(app=_build_app(fake_db)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v2/items/510001?verify_sql=true")

    body = response.json()
    assert response.status_code == 200
    assert body["data"]["stock_qty"] == 33.0
    assert body["data"]["cached_stock_qty"] == 33.0
    assert body["data"]["quantity_source"] == "sync_cache"
    assert body["data"]["sql_verification_in_progress"] is True
    assert body["data"]["sql_available"] is None

    await asyncio.gather(*captured, return_exceptions=True)
    verify_item_quantity.assert_awaited_once_with("1")


@pytest.mark.asyncio
async def test_item_details_cache_headers_on_verify_sql(monkeypatch):
    old_time = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=14)
    fake_db = SimpleNamespace(
        erp_items=SimpleNamespace(
            find_one=AsyncMock(
                side_effect=[
                    _item_doc(last_synced=old_time),
                    _item_doc(last_synced=old_time, sql_verified_qty=24.0),
                ]
            )
        )
    )
    verify_item_quantity = AsyncMock(return_value={"success": True})

    mock_cache_service = SimpleNamespace(delete=AsyncMock(), clear_pattern=AsyncMock())

    monkeypatch.setattr(items, "get_db", lambda: fake_db)
    monkeypatch.setattr(
        items.sql_verification_service, "verify_item_quantity", verify_item_quantity
    )
    monkeypatch.setattr("backend.api.v2.items.cache_service", mock_cache_service, raising=False)
    monkeypatch.setattr("backend.core.globals.cache_service", mock_cache_service, raising=False)

    async with AsyncClient(
        transport=ASGITransport(app=_build_app(fake_db)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v2/items/510001?verify_sql=true")

    body = response.json()
    assert response.status_code == 200
    assert response.headers.get("Cache-Control") == "no-cache, private"
    assert response.headers.get("Vary") == "Authorization"
    assert body["data"]["response_version"] == 2


@pytest.mark.asyncio
async def test_item_details_triggers_background_sql_sync_on_selection(monkeypatch):
    fake_db = SimpleNamespace(
        erp_items=SimpleNamespace(find_one=AsyncMock(return_value=_item_doc()))
    )
    monkeypatch.setattr(items, "get_db", lambda: fake_db)

    mock_sync = AsyncMock()
    fake_svc = SimpleNamespace(sql_sync_service=SimpleNamespace(sync_single_item_by_code=mock_sync))
    monkeypatch.setattr(
        items.item_refresh_service, "sql_sync_service", fake_svc.sql_sync_service, raising=False
    )

    captured = []

    def _create_task(coro):
        task = asyncio.get_running_loop().create_task(coro)
        captured.append(task)
        return task

    monkeypatch.setattr(asyncio, "create_task", _create_task)

    async with AsyncClient(
        transport=ASGITransport(app=_build_app(fake_db)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v2/items/510001")

    assert response.status_code == 200
    await asyncio.gather(*captured, return_exceptions=True)
    mock_sync.assert_awaited_once_with("1")


@pytest.mark.asyncio
async def test_item_details_background_sync_skipped_when_sql_unavailable(monkeypatch):
    fake_db = SimpleNamespace(
        erp_items=SimpleNamespace(find_one=AsyncMock(return_value=_item_doc()))
    )
    monkeypatch.setattr(items, "get_db", lambda: fake_db)
    monkeypatch.setattr(items.item_refresh_service, "sql_sync_service", None, raising=False)

    captured = []

    def _create_task(coro):
        task = asyncio.get_running_loop().create_task(coro)
        captured.append(task)
        return task

    monkeypatch.setattr(asyncio, "create_task", _create_task)

    async with AsyncClient(
        transport=ASGITransport(app=_build_app(fake_db)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v2/items/510001")

    assert response.status_code == 200
    await asyncio.gather(*captured, return_exceptions=True)
