import asyncio
import pytest
from httpx import AsyncClient
import uuid

from backend.services.observability import metrics as observability_metrics


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
                "record_id": client_record_id,
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

    replay = await async_client.post(
        "/api/sync/batch", json=payload, headers=authenticated_headers
    )
    assert replay.status_code == 200
    assert client_record_id in replay.json()["ok"]
    count = await test_db.count_lines.count_documents(
        {"session_id": session_id, "idempotency_key": client_record_id}
    )
    assert count == 1

    collision_payload = {
        "records": [
            {
                **payload["records"][0],
                "client_record_id": f"{client_record_id}-collision",
            }
        ],
        "batch_id": "batch-123-collision",
    }
    collision = await async_client.post(
        "/api/sync/batch", json=collision_payload, headers=authenticated_headers
    )
    assert collision.status_code == 409
    collision_data = collision.json()["detail"]
    assert collision_data["code"] == "SYNC_BATCH_VALIDATION_FAILED"
    assert collision_data["conflicts"][0]["conflict_type"] == "DUPLICATE_RECORD_ID"
    count_after_collision = await test_db.count_lines.count_documents(
        {"session_id": session_id, "idempotency_key": client_record_id}
    )
    assert count_after_collision == 1


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
                "record_id": "rec-1",
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
                "record_id": "rec-2",
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
    assert resp2.status_code == 409
    data2 = resp2.json()["detail"]

    assert len(data2["conflicts"]) == 1
    assert data2["conflicts"][0]["conflict_type"] == "duplicate_serial"
    assert serial in data2["conflicts"][0]["message"]


@pytest.mark.asyncio
async def test_modern_batch_sync_rejects_partial_location_and_unknown_item(
    async_client: AsyncClient, authenticated_headers, test_db
):
    session_id = str(uuid.uuid4())
    await _seed_active_session_with_snapshot(test_db, session_id=session_id, item_code="ITEM-KNOWN")

    payload = {
        "records": [
            {
                "record_id": "rec-missing-location",
                "client_record_id": "rec-missing-location",
                "session_id": session_id,
                "location_id": "LOC-1",
                "floor_id": "",
                "rack_id": "R1",
                "item_code": "ITEM-KNOWN",
                "verified_qty": 1.0,
                "created_at": "2024-01-01T10:01:00Z",
                "updated_at": "2024-01-01T10:01:00Z",
            },
            {
                "record_id": "rec-unknown-item",
                "client_record_id": "rec-unknown-item",
                "session_id": session_id,
                "location_id": "LOC-1",
                "floor_id": "F1",
                "rack_id": "R1",
                "item_code": "ITEM-UNKNOWN",
                "verified_qty": 1.0,
                "created_at": "2024-01-01T10:01:00Z",
                "updated_at": "2024-01-01T10:01:00Z",
            },
        ]
    }

    response = await async_client.post(
        "/api/sync/batch", json=payload, headers=authenticated_headers
    )

    assert response.status_code == 409
    conflict_types = {
        conflict["client_record_id"]: conflict["conflict_type"]
        for conflict in response.json()["detail"]["conflicts"]
    }
    assert conflict_types == {
        "rec-missing-location": "INVALID_LOCATION",
        "rec-unknown-item": "UNKNOWN_ITEM_CODE",
    }


def _build_sync_record(
    *,
    record_id: str,
    session_id: str,
    item_code: str,
    retry_count: int = 0,
    rack_id: str = "R1",
    verified_qty: float = 1.0,
) -> dict:
    return {
        "record_id": record_id,
        "client_record_id": record_id,
        "session_id": session_id,
        "location_id": "LOC-1",
        "floor_id": "F1",
        "rack_id": rack_id,
        "item_code": item_code,
        "verified_qty": verified_qty,
        "damaged_qty": 0.0,
        "serial_numbers": [],
        "created_at": "2024-01-01T10:00:00Z",
        "updated_at": "2024-01-01T10:00:00Z",
        "retry_count": retry_count,
    }


@pytest.mark.asyncio
async def test_batch_sync_replay_200_operations_converges_without_conflicts(
    async_client: AsyncClient,
    authenticated_headers,
    test_db,
):
    session_id = str(uuid.uuid4())
    await _seed_active_session_with_snapshot(
        test_db, session_id=session_id, item_code="ITEM-STRESS-1"
    )

    first_batch_records = [
        _build_sync_record(
            record_id=f"offline-{index:03d}",
            session_id=session_id,
            item_code="ITEM-STRESS-1",
            retry_count=index % 2,
            rack_id=f"R{index:03d}",
            verified_qty=float(index + 1),
        )
        for index in range(150)
    ]
    first_response = await async_client.post(
        "/api/sync/batch",
        json={"records": first_batch_records, "batch_id": "batch-stress-1"},
        headers=authenticated_headers,
    )
    assert first_response.status_code == 200
    first_body = first_response.json()
    assert first_body["failed_count"] == 0
    assert len(first_body["ok"]) == 150

    replay_records = [
        _build_sync_record(
            record_id=f"offline-{index:03d}",
            session_id=session_id,
            item_code="ITEM-STRESS-1",
            retry_count=2 + (index % 2),
            rack_id=f"R{index:03d}",
            verified_qty=float(index + 1),
        )
        for index in range(50)
    ]
    replay_response = await async_client.post(
        "/api/sync/batch",
        json={"records": replay_records, "batch_id": "batch-stress-2"},
        headers=authenticated_headers,
    )
    assert replay_response.status_code == 200
    replay_body = replay_response.json()
    assert replay_body["failed_count"] == 0
    assert len(replay_body["ok"]) == 50

    total_success = len(first_body["ok"]) + len(replay_body["ok"])
    assert total_success == 200

    inserted_lines = await test_db.count_lines.count_documents({"session_id": session_id})
    idempotency_rows = await test_db.idempotency_operations.count_documents(
        {"session_id": session_id}
    )
    assert inserted_lines == 150
    assert idempotency_rows == 150


@pytest.mark.asyncio
async def test_batch_sync_parallel_duplicate_writes_are_idempotent(
    async_client: AsyncClient,
    authenticated_headers,
    test_db,
):
    session_id = str(uuid.uuid4())
    record_id = "parallel-idem-1"
    await _seed_active_session_with_snapshot(
        test_db, session_id=session_id, item_code="ITEM-PARALLEL-1"
    )

    payload = {
        "records": [
            _build_sync_record(
                record_id=record_id,
                session_id=session_id,
                item_code="ITEM-PARALLEL-1",
                rack_id="R-PARALLEL-1",
                verified_qty=7.0,
            )
        ],
        "batch_id": "batch-parallel-idem",
    }

    parallel_clients = 10
    requests = [
        async_client.post(
            "/api/sync/batch",
            json=payload,
            headers=authenticated_headers,
        )
        for _ in range(parallel_clients)
    ]
    responses = await asyncio.gather(*requests)

    assert all(response.status_code == 200 for response in responses)
    for response in responses:
        body = response.json()
        assert body["failed_count"] == 0
        assert body["success_count"] == 1
        assert body["ok"] == [record_id]

    inserted_lines = await test_db.count_lines.count_documents(
        {"session_id": session_id, "idempotency_key": record_id}
    )
    idempotency_rows = await test_db.idempotency_operations.count_documents(
        {"operation_id": record_id}
    )
    assert inserted_lines == 1
    assert idempotency_rows == 1


@pytest.mark.asyncio
async def test_sync_queue_metric_resets_to_zero_on_validation_failure(
    async_client: AsyncClient,
    authenticated_headers,
    test_db,
):
    session_id = str(uuid.uuid4())
    await _seed_active_session_with_snapshot(
        test_db, session_id=session_id, item_code="ITEM-METRIC-1"
    )

    payload = {
        "records": [
            _build_sync_record(
                record_id="metric-invalid-1",
                session_id=session_id,
                item_code="ITEM-METRIC-1",
                rack_id="R-METRIC-1",
                verified_qty=1.0,
            )
        ],
        "batch_id": "batch-metric-invalid",
    }
    payload["records"][0]["location_id"] = ""

    response = await async_client.post(
        "/api/sync/batch",
        json=payload,
        headers=authenticated_headers,
    )

    assert response.status_code == 409
    metrics_snapshot = await observability_metrics.get_metrics()
    assert metrics_snapshot["gauges"].get("sync_queue_size") == 0.0
