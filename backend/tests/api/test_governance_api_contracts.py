from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest


def _type_name(value):
    if value is None:
        return "null"
    return type(value).__name__


def _snapshot_types(payload: dict, keys: list[str]) -> dict[str, str]:
    return {key: _type_name(payload.get(key)) for key in keys}


async def _seed_session_and_item(test_db, session_id: str, username: str = "staff1") -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "warehouse": "Main Warehouse",
            "location_id": "Main Warehouse",
            "location_type": "Main Warehouse",
            "location_name": "Floor-1",
            "rack_no": "A1",
            "status": "ACTIVE",
            "type": "STANDARD",
            "staff_user": username,
            "staff_name": "Staff Member",
            "started_at": now,
            "last_heartbeat": now,
        }
    )

    await test_db.erp_items.insert_one(
        {
            "item_code": "ITEM-001",
            "item_name": "Contract Test Item",
            "barcode": "BAR-ITEM-001",
            "stock_qty": 10.0,
            "warehouse": "Main Warehouse",
            "floor": "Floor-1",
            "rack": "A1",
            "mrp": 100.0,
        }
    )
    await test_db.session_snapshots.insert_one(
        {
            "session_id": session_id,
            "snapshot_hash": f"snapshot-{session_id}",
            "items": [{"item_code": "ITEM-001", "stock_qty": 10.0}],
            "created_at": now,
        }
    )


@pytest.mark.asyncio
async def test_sessions_create_response_contract(async_client, authenticated_headers):
    response = await async_client.post(
        "/api/sessions/",
        json={
            "warehouse": "Main Warehouse",
            "type": "STANDARD",
            "client_session_id": str(uuid4()),
        },
        headers=authenticated_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert _snapshot_types(
        data,
        [
            "id",
            "warehouse",
            "type",
            "status",
            "staff_user",
            "staff_name",
            "started_at",
            "client_session_id",
        ],
    ) == {
        "id": "str",
        "warehouse": "str",
        "type": "str",
        "status": "str",
        "staff_user": "str",
        "staff_name": "str",
        "started_at": "str",
        "client_session_id": "str",
    }


@pytest.mark.asyncio
async def test_count_lines_create_response_contract(
    async_client, test_db, authenticated_headers
):
    session_id = "contract-session-1"
    await _seed_session_and_item(test_db, session_id)

    response = await async_client.post(
        "/api/count-lines",
        json={
            "session_id": session_id,
            "location_id": "Main Warehouse",
            "floor_no": "Floor-1",
            "rack_no": "A1",
                "item_code": "ITEM-001",
                "barcode": "BAR-ITEM-001",
                "counted_qty": 10,
                "idempotency_key": "contract-create-idem-1",
            },
            headers=authenticated_headers,
        )

    assert response.status_code == 200, response.text
    data = response.json()
    assert _snapshot_types(
        data,
        [
            "id",
            "session_id",
            "item_code",
            "counted_qty",
            "location_id",
            "floor_id",
            "rack_id",
            "idempotency_key",
            "status",
            "approval_status",
            "counted_by",
            "counted_at",
        ],
    ) == {
        "id": "str",
        "session_id": "str",
        "item_code": "str",
        "counted_qty": "float",
        "location_id": "str",
        "floor_id": "str",
        "rack_id": "str",
        "idempotency_key": "str",
        "status": "str",
        "approval_status": "str",
        "counted_by": "str",
        "counted_at": "str",
    }


@pytest.mark.asyncio
async def test_count_lines_draft_response_contract(
    async_client, test_db, authenticated_headers
):
    session_id = "contract-session-2"
    await _seed_session_and_item(test_db, session_id)

    response = await async_client.post(
        "/api/count-lines/draft",
        json={
            "session_id": session_id,
            "item_code": "ITEM-001",
            "barcode": "BAR-ITEM-001",
            "counted_qty": 2,
            "floor_no": "Floor-1",
            "rack_no": "A1",
        },
        headers=authenticated_headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert _snapshot_types(body, ["success", "message", "data"]) == {
        "success": "bool",
        "message": "str",
        "data": "dict",
    }
    assert _snapshot_types(
        body["data"],
        [
            "id",
            "session_id",
            "item_code",
            "counted_qty",
            "location_id",
            "floor_id",
            "rack_id",
            "line_id",
            "status",
            "updated_at",
        ],
    ) == {
        "id": "str",
        "session_id": "str",
        "item_code": "str",
        "counted_qty": "float",
        "location_id": "str",
        "floor_id": "str",
        "rack_id": "str",
        "line_id": "str",
        "status": "str",
        "updated_at": "str",
    }


@pytest.mark.asyncio
async def test_sync_batch_error_contracts(async_client, authenticated_headers):
    no_records = await async_client.post(
        "/api/sync/batch",
        json={"records": []},
        headers=authenticated_headers,
    )
    assert no_records.status_code == 400
    assert _snapshot_types(no_records.json(), ["detail"]) == {"detail": "str"}

    operations_payload = await async_client.post(
        "/api/sync/batch",
        json={"operations": [{"id": "legacy-op"}]},
        headers=authenticated_headers,
    )
    assert operations_payload.status_code == 410
    assert _snapshot_types(operations_payload.json(), ["detail"]) == {"detail": "str"}
