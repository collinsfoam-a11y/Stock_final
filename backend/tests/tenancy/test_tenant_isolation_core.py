from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from backend.api import count_lines_routes, recount_api, session_management_api
from backend.api import reporting_api
from backend.api.reporting_api import QuerySpec
from backend.api.unknown_items_api import list_unknown_items
from backend.services.movement_service import MovementService
from backend.services.unknown_item_service import UnknownItemService
from backend.tenancy.org_context import set_current_org_id


@pytest.mark.asyncio
async def test_reporting_preview_query_injects_org_match(monkeypatch):
    set_current_org_id("org-a")
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[])

    mock_collection = MagicMock()
    mock_collection.aggregate = MagicMock(return_value=mock_cursor)

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    monkeypatch.setattr(reporting_api, "get_db", lambda: mock_db)

    result = await reporting_api.preview_query(
        QuerySpec(collection="count_lines"),
        current_user={"username": "u1", "org_id": "org-a"},
    )

    assert result["collection"] == "count_lines"
    assert result["mongo_collection"] == "count_lines"
    pipeline = mock_collection.aggregate.call_args.args[0]
    assert pipeline[0].get("$match")
    assert {"org_id": "org-a"} in pipeline[0]["$match"]["$and"]


@pytest.mark.asyncio
async def test_reporting_preview_query_rejects_invalid_collection(monkeypatch):
    set_current_org_id("org-a")
    mock_db = MagicMock()
    monkeypatch.setattr(reporting_api, "get_db", lambda: mock_db)

    with pytest.raises(HTTPException) as exc:
        await reporting_api.preview_query(
            QuerySpec(collection="users"),
            current_user={"username": "u1", "org_id": "org-a"},
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_unknown_items_list_scopes_by_org():
    set_current_org_id("org-a")
    mock_db = MagicMock()
    mock_db.unknown_items.find = MagicMock(return_value=MagicMock(sort=lambda *a, **k: MagicMock(skip=lambda *a, **k: MagicMock(limit=lambda *a, **k: MagicMock(to_list=AsyncMock(return_value=[]))))))
    mock_db.unknown_items.count_documents = AsyncMock(return_value=0)

    result = await list_unknown_items(
        session_id=None,
        reported_by=None,
        include_dismissed=False,
        limit=50,
        skip=0,
        db=mock_db,
        current_user={"username": "admin1", "role": "admin", "org_id": "org-a"},
    )

    assert result["success"] is True
    query = mock_db.unknown_items.count_documents.await_args.args[0]
    assert {"org_id": "org-a"} in query["$and"]


@pytest.mark.asyncio
async def test_unknown_item_service_stamps_org_id_on_register():
    set_current_org_id("org-a")
    mock_db = MagicMock()
    mock_db.client = None
    mock_db.unknown_items.insert_one = AsyncMock()

    service = UnknownItemService(mock_db)
    service.lifecycle_service.ensure_session_active = AsyncMock(return_value={"id": "sess-1"})
    service.audit_service.log_write_event = AsyncMock(return_value=None)

    doc = await service.register_unknown_item(
        payload={
            "session_id": "sess-1",
            "location_id": "LOC-1",
            "floor_id": "F1",
            "rack_id": "R1",
            "barcode": "B1",
        },
        actor_id="staff1",
    )

    assert doc["org_id"] == "org-a"


@pytest.mark.asyncio
async def test_movement_service_stamps_org_id_on_manual_movement():
    set_current_org_id("org-a")
    mock_db = MagicMock()
    mock_db.inventory_movements.insert_one = AsyncMock()

    service = MovementService(mock_db)
    doc = await service.create_manual_movement(
        session_id="sess-1",
        warehouse="WH-1",
        item_code="ITEM-1",
        movement_type="ADJUST",
        quantity=1,
        occurred_at=None,
        reason_code="RC",
        reason="R",
        actor_username="admin1",
    )

    assert doc["org_id"] == "org-a"


@pytest.mark.asyncio
async def test_session_management_get_sessions_scopes_by_org():
    set_current_org_id("org-a")
    mock_cursor = MagicMock()
    mock_cursor.sort = MagicMock(return_value=mock_cursor)
    mock_cursor.skip = MagicMock(return_value=mock_cursor)
    mock_cursor.limit = MagicMock(return_value=mock_cursor)
    mock_cursor.to_list = AsyncMock(return_value=[])

    mock_db = MagicMock()
    mock_db.sessions.count_documents = AsyncMock(return_value=0)
    mock_db.sessions.find = MagicMock(return_value=mock_cursor)

    await session_management_api.get_sessions(
        page=1,
        page_size=20,
        status=None,
        user_id=None,
        db=mock_db,
        current_user={"username": "u1", "role": "staff", "org_id": "org-a"},
    )

    query = mock_db.sessions.count_documents.await_args.args[0]
    assert {"org_id": "org-a"} in query["$and"]
    assert query["$and"][0]["staff_user"] == "u1"


@pytest.mark.asyncio
async def test_session_management_get_active_sessions_scopes_by_org():
    set_current_org_id("org-a")
    mock_cursor = MagicMock()
    mock_cursor.sort = MagicMock(return_value=mock_cursor)
    mock_cursor.to_list = AsyncMock(return_value=[])

    mock_db = MagicMock()
    mock_db.sessions.find = MagicMock(return_value=mock_cursor)

    await session_management_api.get_active_sessions(
        user_id=None,
        rack_id=None,
        db=mock_db,
        current_user={"username": "u1", "role": "staff", "org_id": "org-a"},
    )

    query = mock_db.sessions.find.call_args.args[0]
    assert {"org_id": "org-a"} in query["$and"]


@pytest.mark.asyncio
async def test_session_management_get_user_session_history_scopes_by_org():
    set_current_org_id("org-a")
    mock_cursor = MagicMock()
    mock_cursor.sort = MagicMock(return_value=mock_cursor)
    mock_cursor.limit = MagicMock(return_value=mock_cursor)
    mock_cursor.to_list = AsyncMock(return_value=[])

    mock_db = MagicMock()
    mock_db.sessions.find = MagicMock(return_value=mock_cursor)

    await session_management_api.get_user_session_history(
        limit=10,
        db=mock_db,
        current_user={"username": "u1", "role": "staff", "org_id": "org-a"},
    )

    query = mock_db.sessions.find.call_args.args[0]
    assert {"org_id": "org-a"} in query["$and"]
    assert query["$and"][0]["staff_user"] == "u1"


@pytest.mark.asyncio
async def test_count_lines_check_item_counted_scopes_by_org(monkeypatch):
    set_current_org_id("org-a")
    monkeypatch.setenv("V3_PROJECTION_READS", "0")
    monkeypatch.setenv("V3_PROJECTION_STRICT_MODE", "0")

    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[])

    mock_db = MagicMock()
    mock_db.sessions.find_one = AsyncMock(return_value={"_id": "sess"})
    mock_db.count_lines.find = MagicMock(return_value=mock_cursor)

    monkeypatch.setattr(count_lines_routes, "_get_db_client", lambda: mock_db)

    await count_lines_routes.check_item_counted(
        session_id="sess-1",
        item_code="ITEM-1",
        current_user={"username": "u1", "org_id": "org-a"},
    )

    session_query = mock_db.sessions.find_one.await_args.args[0]
    assert {"org_id": "org-a"} in session_query["$and"]

    count_line_query = mock_db.count_lines.find.call_args.args[0]
    assert {"org_id": "org-a"} in count_line_query["$and"]


@pytest.mark.asyncio
async def test_count_lines_check_serial_uniqueness_scopes_by_org(monkeypatch):
    set_current_org_id("org-a")
    mock_db = MagicMock()
    mock_db.sessions.find_one = AsyncMock(return_value={"_id": "sess"})
    mock_db.serial_registry.find_one = AsyncMock(return_value=None)
    mock_db.item_serials.find_one = AsyncMock(return_value=None)
    mock_db.count_lines.find_one = AsyncMock(return_value=None)

    monkeypatch.setattr(count_lines_routes, "_get_db_client", lambda: mock_db)

    await count_lines_routes.check_serial_uniqueness(
        session_id="sess-1",
        serial_number="S1",
        current_user={"username": "u1", "org_id": "org-a"},
        item_code=None,
    )

    session_query = mock_db.sessions.find_one.await_args.args[0]
    assert {"org_id": "org-a"} in session_query["$and"]

    registry_query = mock_db.serial_registry.find_one.await_args.args[0]
    assert {"org_id": "org-a"} in registry_query["$and"]


@pytest.mark.asyncio
async def test_count_lines_scan_status_scopes_by_org(monkeypatch):
    set_current_org_id("org-a")
    monkeypatch.setenv("V3_PROJECTION_READS", "0")
    monkeypatch.setenv("V3_PROJECTION_STRICT_MODE", "0")

    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[])

    mock_db = MagicMock()
    mock_db.sessions.find_one = AsyncMock(return_value={"_id": "sess"})
    mock_db.count_lines.find = MagicMock(return_value=mock_cursor)

    monkeypatch.setattr(count_lines_routes, "_get_db_client", lambda: mock_db)

    await count_lines_routes.check_item_scan_status(
        session_id="sess-1",
        item_code="ITEM-1",
        current_user={"username": "u1", "org_id": "org-a"},
    )

    count_line_query = mock_db.count_lines.find.call_args.args[0]
    assert {"org_id": "org-a"} in count_line_query["$and"]


@pytest.mark.asyncio
async def test_recount_list_scopes_by_org():
    set_current_org_id("org-a")
    mock_cursor = MagicMock()
    mock_cursor.sort = MagicMock(return_value=mock_cursor)
    mock_cursor.skip = MagicMock(return_value=mock_cursor)
    mock_cursor.limit = MagicMock(return_value=mock_cursor)
    mock_cursor.to_list = AsyncMock(return_value=[])

    mock_db = MagicMock()
    mock_db.recount_requests.count_documents = AsyncMock(return_value=0)
    mock_db.recount_requests.find = MagicMock(return_value=mock_cursor)

    await recount_api.list_recount_requests(
        status=None,
        assigned_to=None,
        priority=None,
        limit=50,
        offset=0,
        current_user={"username": "u1", "role": "staff", "org_id": "org-a"},
        db=mock_db,
    )

    query = mock_db.recount_requests.count_documents.await_args.args[0]
    assert {"org_id": "org-a"} in query["$and"]
