"""
Tests for Enhanced Item API
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from backend.api.enhanced_item_api import (
    _build_search_pipeline,
    _validate_barcode_format,
    advanced_item_search,
    get_item_by_barcode_enhanced,
    get_unique_locations,
    init_enhanced_api,
)
from fastapi import HTTPException


@pytest.fixture(autouse=True)
def setup_mocks():
    mock_db = AsyncMock()
    # Configure aggregate to be synchronous (return cursor immediately)
    mock_db.erp_items.aggregate = MagicMock()

    mock_cache = AsyncMock()
    mock_monitoring = MagicMock()
    mock_monitoring.track_request = AsyncMock()
    mock_sql_connector = MagicMock()

    # Initialize API
    init_enhanced_api(mock_db, mock_cache, mock_monitoring, mock_sql_connector)

    # Configure sql_sync_service mock to return None by default (no sync result)
    # We need to access the global sql_sync_service that was created inside init_enhanced_api
    from backend.api import enhanced_item_api

    if enhanced_item_api.sql_sync_service:
        enhanced_item_api.sql_sync_service.sync_single_item_by_barcode = AsyncMock(
            return_value=None
        )

    return mock_db, mock_cache, mock_monitoring


@pytest.mark.asyncio
async def test_validate_barcode_format():
    # Use valid prefix 51
    assert _validate_barcode_format("510001") == "510001"

    with pytest.raises(HTTPException) as exc:
        _validate_barcode_format(None)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_get_item_by_barcode_enhanced_mongodb(setup_mocks):
    mock_db, mock_cache, mock_monitoring = setup_mocks

    # Mock MongoDB response
    mock_item = {
        "_id": "item123",
        "item_code": "CODE123",
        "barcode": "510001",
        "item_name": "Test Item",
    }
    mock_db.erp_items.find_one.return_value = mock_item

    # Mock Cache miss
    mock_cache.get_async.return_value = None

    request = MagicMock(method="GET")
    current_user = {"username": "testuser"}

    response = await get_item_by_barcode_enhanced(
        barcode="510001",
        request=request,
        current_user=current_user,
        force_source=None,  # Explicitly pass None to avoid Query object
    )

    assert response["item"]["item_code"] == "CODE123"
    assert response["metadata"]["source"] == "mongodb"

    # Verify cache set was called
    mock_cache.set_async.assert_called_once()
    mock_monitoring.track_request.assert_awaited_once()
    assert mock_monitoring.track_request.await_args.kwargs["method"] == "GET"
    assert mock_monitoring.track_request.await_args.kwargs["status_code"] == 200


@pytest.mark.asyncio
async def test_get_item_by_barcode_enhanced_cache(setup_mocks):
    mock_db, mock_cache, _ = setup_mocks

    # Mock Cache hit
    cached_item = {"item": {"item_code": "CODE123", "barcode": "510001", "item_name": "Test Item"}}
    mock_cache.get_async.return_value = cached_item

    request = MagicMock(method="GET")
    current_user = {"username": "testuser"}

    response = await get_item_by_barcode_enhanced(
        barcode="510001",
        request=request,
        current_user=current_user,
        force_source=None,  # Explicitly pass None
    )

    assert response["item"]["item_code"] == "CODE123"
    assert response["metadata"]["source"] == "cache"

    # Verify DB was NOT called
    mock_db.erp_items.find_one.assert_not_called()


@pytest.mark.asyncio
async def test_get_item_by_barcode_enhanced_strips_contextual_fields_from_cache(setup_mocks):
    _, mock_cache, _ = setup_mocks

    mock_cache.get_async.return_value = {
        "item": {
            "item_code": "CODE123",
            "barcode": "510001",
            "item_name": "Test Item",
            "is_misplaced": True,
            "expected_location": "F1/R1",
        }
    }

    request = MagicMock(method="GET")
    current_user = {"username": "testuser"}

    response = await get_item_by_barcode_enhanced(
        barcode="510001",
        request=request,
        current_user=current_user,
        force_source=None,
    )

    assert response["metadata"]["source"] == "cache"
    assert "is_misplaced" not in response["item"]
    assert "expected_location" not in response["item"]


@pytest.mark.asyncio
async def test_get_item_by_barcode_enhanced_does_not_cache_contextual_fields(setup_mocks):
    mock_db, mock_cache, _ = setup_mocks

    mock_db.erp_items.find_one.return_value = {
        "_id": "item123",
        "item_code": "CODE123",
        "barcode": "510001",
        "item_name": "Test Item",
        "floor": "F1",
        "rack": "R1",
    }
    mock_db.sessions.find_one.return_value = {"id": "session-1", "floor": "F2", "rack": "R2"}
    mock_cache.get_async.return_value = None

    request = MagicMock(method="GET")
    current_user = {"username": "testuser"}

    response = await get_item_by_barcode_enhanced(
        barcode="510001",
        request=request,
        current_user=current_user,
        force_source=None,
        session_id="session-1",
        rack_no=None,
    )

    assert response["item"]["is_misplaced"] is True
    mock_db.sessions.find_one.assert_awaited_once_with(
        {"$or": [{"id": "session-1"}, {"session_id": "session-1"}]}
    )

    cached_payload = mock_cache.set_async.await_args.args[2]
    assert cached_payload["item"]["item_code"] == "CODE123"
    assert "is_misplaced" not in cached_payload["item"]
    assert "expected_location" not in cached_payload["item"]


@pytest.mark.asyncio
async def test_get_item_by_barcode_enhanced_sql_sync(setup_mocks):
    mock_db, mock_cache, _ = setup_mocks

    # Configure SQL sync to return an item
    from backend.api import enhanced_item_api

    mock_synced_item = {
        "_id": "item_synced_123",
        "item_code": "CODE_SYNCED",
        "barcode": "510001",
        "item_name": "Synced Item",
        "stock_qty": 100.0,
    }
    enhanced_item_api.sql_sync_service.sync_single_item_by_barcode.return_value = mock_synced_item

    request = MagicMock(method="GET")
    current_user = {"username": "testuser"}

    response = await get_item_by_barcode_enhanced(
        barcode="510001",
        request=request,
        current_user=current_user,
        force_source=None,
    )

    assert response["item"]["item_code"] == "CODE_SYNCED"
    assert response["metadata"]["source"] == "sql_server_sync"

    # Verify DB find_one was NOT called (because sync returned item)
    # Actually, sync service might call DB internally, but here we are mocking the service call
    # and the API logic shouldn't call find_one if sync returns item.
    mock_db.erp_items.find_one.assert_not_called()


@pytest.mark.asyncio
async def test_get_item_by_barcode_enhanced_not_found(setup_mocks):
    mock_db, mock_cache, _ = setup_mocks

    mock_db.erp_items.find_one.return_value = None
    mock_cache.get_async.return_value = None

    request = MagicMock(method="GET")
    current_user = {"username": "testuser"}

    with pytest.raises(HTTPException) as exc:
        await get_item_by_barcode_enhanced(
            barcode="519999",
            request=request,
            current_user=current_user,
            force_source=None,  # Explicitly pass None
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_advanced_item_search(setup_mocks):
    mock_db, _, _ = setup_mocks

    # Mock Aggregation response
    mock_results = [
        {
            "_id": "item1",
            "item_name": "Test Item 1",
            "item_code": "C1",
            "barcode": "B1",
            "relevance_score": 10,
        },
        {
            "_id": "item2",
            "item_name": "Test Item 2",
            "item_code": "C2",
            "barcode": "B2",
            "relevance_score": 5,
        },
    ]

    # Mock cursor
    mock_cursor = AsyncMock()
    mock_cursor.to_list.return_value = mock_results

    # Mock count result (second call to aggregate)
    mock_count_cursor = AsyncMock()
    mock_count_cursor.to_list.return_value = [{"total": 2}]

    # Configure aggregate to return different cursors
    mock_db.erp_items.aggregate.side_effect = [mock_cursor, mock_count_cursor]

    current_user = {"username": "testuser"}

    response = await advanced_item_search(
        query="Test",
        search_fields=["item_name", "item_code", "barcode"],
        limit=20,  # Explicitly pass limit
        offset=0,  # Explicitly pass offset
        sort_by="relevance",
        category=None,
        warehouse=None,
        floor=None,
        rack=None,
        stock_level=None,
        current_user=current_user,
    )

    assert len(response["items"]) == 2
    assert response["pagination"]["total"] == 2
    assert response["items"][0]["item_name"] == "Test Item 1"


@pytest.mark.asyncio
async def test_build_search_pipeline_preserves_filter_mapping_and_escapes_literals():
    pipeline = _build_search_pipeline(
        query="ABC+123",
        search_fields=["item_name"],
        limit=25,
        offset=0,
        sort_by="relevance",
        category="Food(1)",
        warehouse="Main",
        stock_level="high",
        floor="F[1]",
        rack="R+1",
    )

    match_stage = pipeline[0]["$match"]
    assert match_stage["$or"] == [{"item_name": {"$regex": r"ABC\+123", "$options": "i"}}]
    assert match_stage["category"] == {"$regex": r"Food\(1\)", "$options": "i"}
    assert match_stage["warehouse"] == {"$regex": "Main", "$options": "i"}
    assert match_stage["floor"] == {"$regex": r"F\[1\]", "$options": "i"}
    assert match_stage["rack"] == {"$regex": r"R\+1", "$options": "i"}
    assert match_stage["stock_qty"] == {"$gte": 100}


@pytest.mark.asyncio
async def test_get_unique_locations(setup_mocks):
    mock_db, _, _ = setup_mocks

    mock_result = [{"floors": ["Floor 1", "Floor 2"], "racks": ["Rack A", "Rack B"]}]

    mock_cursor = AsyncMock()
    mock_cursor.to_list.return_value = mock_result
    mock_db.erp_items.aggregate.return_value = mock_cursor

    current_user = {"username": "testuser"}

    response = await get_unique_locations(current_user=current_user)

    assert response["floors"] == ["Floor 1", "Floor 2"]
    assert response["racks"] == ["Rack A", "Rack B"]
