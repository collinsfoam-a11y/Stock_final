import pytest
from unittest.mock import MagicMock, AsyncMock
from datetime import datetime, date
from backend.utils.erp_utils import (
    _safe_float,
    _safe_str,
    _safe_optional_str,
    _safe_date_str,
    _get_barcode_variations,
    _map_erp_item_to_schema,
    _ensure_sql_connection,
    fetch_item_from_erp,
    refresh_stock_from_erp,
    search_items_in_erp,
)
from fastapi import HTTPException


# Test Helper Functions
def test_safe_float():
    assert _safe_float(10.5) == 10.5
    assert _safe_float("10.5") == 10.5
    assert _safe_float(None) is None
    assert _safe_float("invalid") is None
    assert _safe_float(None, default=0.0) == 0.0


def test_safe_str():
    assert _safe_str("test") == "test"
    assert _safe_str(123) == "123"
    assert _safe_str(None) == ""
    assert _safe_str(None, default="d") == "d"


def test_safe_optional_str():
    assert _safe_optional_str("test") == "test"
    assert _safe_optional_str("") is None
    assert _safe_optional_str(None) is None


def test_safe_date_str():
    dt = datetime(2023, 1, 1, 12, 0, 0)
    d = date(2023, 1, 1)
    assert _safe_date_str(dt) == dt.isoformat()
    assert _safe_date_str(d) == datetime(2023, 1, 1, 0, 0, 0).isoformat()
    assert _safe_date_str(None) is None
    assert _safe_date_str("invalid") == "invalid"  # Should return string as is if not date/datetime

    class Unprintable:
        def __str__(self):
            raise ValueError("fail")

    assert _safe_date_str(Unprintable()) is None


def test_get_barcode_variations():
    assert _get_barcode_variations("123") == ["123", "000123"]
    assert _get_barcode_variations("123456") == ["123456"]
    assert _get_barcode_variations("000123") == ["000123"]  # Duplicates removed

    # "000123":
    # 1. variations = ["000123"]
    # 2. len is 6, so skip padded (len < 6 check)
    # 3. len == 6, so skip trimmed logic (len != 6 check)
    # Result: ["000123"]
    assert _get_barcode_variations("000123") == ["000123"]

    # "00123": len 5.
    # 1. ["00123"]
    # 2. len < 6 -> append "000123" -> ["00123", "000123"]
    # 3. len != 6 -> trim "00123" -> "123". len("123") <= 6 -> append "000123". But "000123" already in list.
    # Result: ["00123", "000123"]
    assert _get_barcode_variations("00123") == ["00123", "000123"]

    # "1234567": len 7.
    # 1. ["1234567"]
    # 2. len >= 6
    # 3. len != 6 -> trim -> "1234567". len > 6 -> skip
    # Result: ["1234567"]
    assert _get_barcode_variations("1234567") == ["1234567"]

    # "0012345": len 7.
    # 1. ["0012345"]
    # 2. len >= 6
    # 3. Trim -> "12345". len 5 <= 6.
    # 4. Padded trimmed -> "012345".
    # 5. "012345" != "0012345". Append.
    assert _get_barcode_variations("0012345") == ["0012345", "012345"]


def test_map_erp_item_to_schema():
    item = {
        "item_code": "C1",
        "item_name": "Item 1",
        "barcode": "123",
        "stock_qty": 10,
        "mrp": "100.50",
        "mfg_date": datetime(2023, 1, 1),
        "sales_price": 90.0,
    }
    mapped = _map_erp_item_to_schema(item)
    assert mapped["item_code"] == "C1"
    assert mapped["stock_qty"] == 10.0
    assert mapped["mrp"] == 100.5
    assert mapped["sales_price"] == 90.0
    assert mapped["manufacturing_date"] is not None


# Async Tests


@pytest.mark.asyncio
async def test_ensure_sql_connection_no_config():
    db = MagicMock()
    db.erp_config.find_one = AsyncMock(return_value=None)
    sql_connector = MagicMock()

    assert await _ensure_sql_connection(sql_connector, db) is False


@pytest.mark.asyncio
async def test_ensure_sql_connection_already_connected():
    db = MagicMock()
    db.erp_config.find_one = AsyncMock(return_value={"use_sql_server": True})
    sql_connector = MagicMock()
    sql_connector.test_connection.return_value = True

    assert await _ensure_sql_connection(sql_connector, db) is True


@pytest.mark.asyncio
async def test_ensure_sql_connection_connect_success():
    db = MagicMock()
    db.erp_config.find_one = AsyncMock(
        return_value={"use_sql_server": True, "host": "localhost", "database": "db"}
    )
    sql_connector = MagicMock()
    sql_connector.test_connection.return_value = False

    assert await _ensure_sql_connection(sql_connector, db) is True
    sql_connector.connect.assert_called_once()


@pytest.mark.asyncio
async def test_ensure_sql_connection_connect_fail():
    db = MagicMock()
    db.erp_config.find_one = AsyncMock(
        return_value={"use_sql_server": True, "host": "localhost", "database": "db"}
    )
    sql_connector = MagicMock()
    sql_connector.test_connection.return_value = False
    sql_connector.connect.side_effect = Exception("Connection fail")

    assert await _ensure_sql_connection(sql_connector, db) is False


@pytest.mark.asyncio
async def test_fetch_item_from_erp_cached():
    cache_service = AsyncMock()
    cache_service.get.return_value = {"item_code": "C1", "barcode": "123"}

    item = await fetch_item_from_erp("123", MagicMock(), MagicMock(), cache_service)
    assert item.item_code == "C1"
    cache_service.get.assert_called_once()


@pytest.mark.asyncio
async def test_fetch_item_from_erp_sql_success():
    cache_service = AsyncMock()
    cache_service.get.return_value = None

    db = MagicMock()
    db.erp_config.find_one = AsyncMock(return_value={"use_sql_server": True})

    sql_connector = MagicMock()
    sql_connector.test_connection.return_value = True
    sql_connector.get_item_by_barcode.return_value = {"item_code": "C1", "barcode": "123"}

    item = await fetch_item_from_erp("123", sql_connector, db, cache_service)
    assert item.item_code == "C1"
    cache_service.set.assert_called_once()


@pytest.mark.asyncio
async def test_fetch_item_from_erp_not_found():
    cache_service = AsyncMock()
    cache_service.get.return_value = None

    db = MagicMock()
    db.erp_config.find_one = AsyncMock(return_value={"use_sql_server": True})
    db.erp_items.find_one = AsyncMock(return_value=None)  # Fallback also fails

    sql_connector = MagicMock()
    sql_connector.test_connection.return_value = True
    sql_connector.get_item_by_barcode.return_value = None

    with pytest.raises(HTTPException) as exc:
        await fetch_item_from_erp("123", sql_connector, db, cache_service)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_refresh_stock_from_erp_success():
    db = MagicMock()
    db.erp_config.find_one = AsyncMock(return_value={"use_sql_server": True})
    db.erp_items.update_one = AsyncMock()

    sql_connector = MagicMock()
    sql_connector.test_connection.return_value = True
    sql_connector.get_item_by_code.return_value = {"item_code": "C1", "stock_qty": 50}

    cache_service = AsyncMock()

    result = await refresh_stock_from_erp("C1", sql_connector, db, cache_service)
    assert result["success"] is True
    assert result["item"].stock_qty == 50.0
    db.erp_items.update_one.assert_called_once()
    cache_service.delete.assert_called_once()


@pytest.mark.asyncio
async def test_search_items_in_erp_sql_success():
    db = MagicMock()
    db.erp_config.find_one = AsyncMock(return_value={"use_sql_server": True})

    sql_connector = MagicMock()
    sql_connector.test_connection.return_value = True
    sql_connector.search_items.return_value = [{"item_code": "C1"}]

    items = await search_items_in_erp("test", sql_connector, db)
    assert len(items) == 1
    assert items[0].item_code == "C1"


@pytest.mark.asyncio
async def test_search_items_in_erp_fallback():
    db = MagicMock()
    db.erp_config.find_one = AsyncMock(return_value=None)  # No SQL

    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[{"item_code": "C1"}])
    db.erp_items.find.return_value = cursor
    cursor.limit.return_value = (
        cursor  # Mock chaining if needed, but implementation does cursor = find().limit()
    )

    items = await search_items_in_erp("test", MagicMock(), db)
    assert len(items) == 1
    assert items[0].item_code == "C1"
