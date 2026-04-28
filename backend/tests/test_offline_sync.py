import pytest
from httpx import AsyncClient
import uuid


async def _seed_active_session_with_snapshot(test_db, *, session_id: str, item_code: str) -> None:
    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "warehouse": "Main Warehouse",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "ACTIVE",
            "type": "STANDARD",
        }
    )
    await test_db.session_snapshots.insert_one(
        {
            "id": f"snap-{session_id}",
            "session_id": session_id,
            "warehouse": "Main Warehouse",
            "snapshot_hash": f"hash-{session_id}",
            "item_count": 1,
            "items": [{"item_code": item_code, "stock_qty": 0.0}],
        }
    )


@pytest.mark.asyncio
async def test_modern_batch_sync_success(async_client: AsyncClient, authenticated_headers, test_db):
    """Test modern batch sync with valid records"""
    session_id = str(uuid.uuid4())
    client_record_id = "rec_" + str(uuid.uuid4())
    await _seed_active_session_with_snapshot(test_db, session_id=session_id, item_code="ITEM-100")

    payload = {
        "records": [
            {
                "client_record_id": client_record_id,
                "session_id": session_id,
                "location_id": "LOC-1",
                "floor_id": "F1",
                "rack_id": "R1",
                "item_code": "ITEM-100",
                "verified_qty": 10.0,
                "damaged_qty": 2.0,
                "serial_numbers": ["SN-100-1", "SN-100-2"],
                "created_at": "2024-01-01T10:00:00Z",
                "updated_at": "2024-01-01T10:05:00Z",
            }
        ],
        "batch_id": "batch-123",
    }

    response = await async_client.post(
        "/api/sync/batch", json=payload, headers=authenticated_headers
    )
    assert response.status_code == 200
    data = response.json()

    assert client_record_id in data["ok"]
    assert len(data["conflicts"]) == 0
    assert len(data["errors"]) == 0


@pytest.mark.asyncio
async def test_modern_batch_sync_duplicate_serial_conflict(
    async_client: AsyncClient, authenticated_headers, test_db
):
    """Test batch sync detects duplicate serial conflict across different sessions"""
    serial = "SN-DUP-999"
    session_1 = str(uuid.uuid4())
    session_2 = str(uuid.uuid4())
    await _seed_active_session_with_snapshot(test_db, session_id=session_1, item_code="ITEM-A")
    await _seed_active_session_with_snapshot(test_db, session_id=session_2, item_code="ITEM-B")

    # 1. Sync first record with serial
    payload1 = {
        "records": [
            {
                "client_record_id": "rec-1",
                "session_id": session_1,
                "location_id": "LOC-1",
                "floor_id": "F1",
                "rack_id": "R1",
                "item_code": "ITEM-A",
                "verified_qty": 1.0,
                "serial_numbers": [serial],
                "created_at": "2024-01-01T10:00:00Z",
                "updated_at": "2024-01-01T10:00:00Z",
            }
        ]
    }
    resp1 = await async_client.post("/api/sync/batch", json=payload1, headers=authenticated_headers)
    assert resp1.status_code == 200

    # 2. Try to sync another record with same serial
    payload2 = {
        "records": [
            {
                "client_record_id": "rec-2",
                "session_id": session_2,
                "location_id": "LOC-2",
                "floor_id": "F2",
                "rack_id": "R2",
                "item_code": "ITEM-B",
                "verified_qty": 1.0,
                "serial_numbers": [serial],
                "created_at": "2024-01-01T10:01:00Z",
                "updated_at": "2024-01-01T10:01:00Z",
            }
        ]
    }
    resp2 = await async_client.post("/api/sync/batch", json=payload2, headers=authenticated_headers)
    assert resp2.status_code == 200
    data2 = resp2.json()

    assert "rec-2" not in data2["ok"]
    assert len(data2["conflicts"]) == 1
    assert data2["conflicts"][0]["conflict_type"] == "duplicate_serial"
    assert serial in data2["conflicts"][0]["message"]
