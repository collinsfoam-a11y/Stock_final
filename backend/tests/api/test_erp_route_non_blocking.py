import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.api.erp_api import get_item_batches, init_erp_api


@pytest.mark.asyncio
async def test_get_item_batches_does_not_call_sql_connector_directly_in_event_loop(
    monkeypatch,
):
    """PERF-10: the ERP batch endpoint must not invoke the blocking SQL
    connector synchronously inside an ``async def``. It must go through
    ``asyncio.to_thread``."""
    mock_db = MagicMock()
    mock_cache = AsyncMock()
    sql_connector = MagicMock()
    sql_connector.connection = object()

    captured: dict = {}

    def blocking_get_item_batches(item_code: str):
        captured["ran_in_thread"] = True
        captured["item_code"] = item_code
        return [{"batch_no": "B1", "stock_qty": 10}]

    sql_connector.get_item_batches = blocking_get_item_batches
    init_erp_api(mock_db, mock_cache, sql_connector)

    original_to_thread = asyncio.to_thread
    to_thread_calls = []

    async def fake_to_thread(func, *args):
        to_thread_calls.append((func, args))
        return await original_to_thread(func, *args)

    monkeypatch.setattr("backend.api.erp_api.asyncio.to_thread", fake_to_thread)

    # Ensure the Mongo fallback path does not short-circuit before the SQL path.
    mock_db.erp_items.find = MagicMock()
    mock_db.erp_items.find.return_value.sort.return_value.limit.return_value.to_list = AsyncMock(
        return_value=[]
    )

    try:
        batches = await get_item_batches("ITEM-1")
    finally:
        init_erp_api(mock_db, mock_cache, None)

    assert captured.get("ran_in_thread") is True
    assert captured.get("item_code") == "ITEM-1"
    assert len(to_thread_calls) >= 1
    assert to_thread_calls[0][0] is sql_connector.get_item_batches
