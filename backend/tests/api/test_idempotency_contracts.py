from __future__ import annotations

from datetime import datetime, timezone

import pytest


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
            "item_name": "Idempotency Item",
            "barcode": "BAR-ITEM-001",
            "stock_qty": 12.0,
            "warehouse": "Main Warehouse",
            "floor": "Floor-1",
            "rack": "A1",
            "mrp": 80.0,
        }
    )
    await test_db.session_snapshots.insert_one(
        {
            "session_id": session_id,
            "snapshot_hash": f"snapshot-{session_id}",
            "items": [{"item_code": "ITEM-001", "stock_qty": 12.0}],
            "created_at": now,
        }
    )


@pytest.mark.asyncio
async def test_count_lines_create_is_idempotent(
    async_client, test_db, authenticated_headers
):
    session_id = "idempotency-session-create"
    await _seed_session_and_item(test_db, session_id)

    payload = {
        "session_id": session_id,
        "location_id": "Main Warehouse",
        "floor_no": "Floor-1",
        "rack_no": "A1",
        "item_code": "ITEM-001",
        "barcode": "BAR-ITEM-001",
        "counted_qty": 12,
        "idempotency_key": "idem-contract-create-1",
    }

    first = await async_client.post(
        "/api/count-lines",
        json=payload,
        headers=authenticated_headers,
    )
    second = await async_client.post(
        "/api/count-lines",
        json=payload,
        headers=authenticated_headers,
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["id"] == second.json()["id"]

    count = await test_db.count_lines.count_documents(
        {
            "session_id": session_id,
            "idempotency_key": "idem-contract-create-1",
        }
    )
    assert count == 1


@pytest.mark.asyncio
async def test_count_lines_draft_upsert_is_idempotent(
    async_client, test_db, authenticated_headers
):
    session_id = "idempotency-session-draft"
    await _seed_session_and_item(test_db, session_id)

    payload = {
        "session_id": session_id,
        "item_code": "ITEM-001",
        "barcode": "BAR-ITEM-001",
        "counted_qty": 2,
        "floor_no": "Floor-1",
        "rack_no": "A1",
    }

    first = await async_client.post(
        "/api/count-lines/draft",
        json=payload,
        headers=authenticated_headers,
    )
    second = await async_client.post(
        "/api/count-lines/draft",
        json=payload,
        headers=authenticated_headers,
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["data"]["line_id"] == second.json()["data"]["line_id"]

    drafts = await test_db.count_line_drafts.find(
        {
            "session_id": session_id,
            "item_code": "ITEM-001",
            "user_id": "staff1",
        }
    ).to_list(length=20)
    assert len(drafts) == 1
