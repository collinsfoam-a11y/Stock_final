from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from backend.api import sync_batch_api


@pytest.mark.asyncio
async def test_sync_batch_redis_dependency_falls_back_in_development(monkeypatch):
    async def fail_get_redis():
        raise RuntimeError("redis down")

    monkeypatch.setattr(sync_batch_api, "get_redis", fail_get_redis)
    monkeypatch.setattr(sync_batch_api.settings, "ENVIRONMENT", "development")

    redis_service = await sync_batch_api.get_sync_batch_redis()

    assert await redis_service.get("rack:lock:R1") is None


@pytest.mark.asyncio
async def test_sync_batch_redis_dependency_returns_503_outside_local_env(monkeypatch):
    async def fail_get_redis():
        raise RuntimeError("redis down")

    monkeypatch.setattr(sync_batch_api, "get_redis", fail_get_redis)
    monkeypatch.setattr(sync_batch_api.settings, "ENVIRONMENT", "production")

    with pytest.raises(HTTPException) as exc:
        await sync_batch_api.get_sync_batch_redis()

    assert exc.value.status_code == 503


def _legacy_count_line_op(
    op_id: str,
    session_id: str,
    *,
    item_code: str = "ITEM-1",
    counted_qty: float = 2.0,
    floor_no: str = "1",
    rack_no: str = "A1",
    idempotency_key: str | None = None,
    recount_of_id: str | None = None,
) -> dict:
    data = {
        "_id": op_id,
        "id": op_id,
        "session_id": session_id,
        "item_code": item_code,
        "counted_qty": counted_qty,
        "floor_no": floor_no,
        "rack_no": rack_no,
        "audit": {"idempotency_key": idempotency_key or op_id},
    }
    if recount_of_id:
        data["recount_of_id"] = recount_of_id

    return {
        "id": op_id,
        "type": "count_line",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }


@pytest.mark.asyncio
async def test_legacy_sync_replay_is_rejected(async_client, test_db, authenticated_headers):
    session_id = "sess-sync-idempotent"
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "warehouse": "Main Warehouse",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": now,
            "last_heartbeat": now,
        }
    )

    operation = _legacy_count_line_op("offline-line-1", session_id, idempotency_key="idem-1")
    payload = {"operations": [operation]}

    first = await async_client.post(
        "/api/sync/batch",
        json=payload,
        headers=authenticated_headers,
    )
    second = await async_client.post(
        "/api/sync/batch",
        json=payload,
        headers=authenticated_headers,
    )

    assert first.status_code == 410
    assert second.status_code == 410
    assert "operations-based sync is disabled" in first.json()["detail"].lower()
    assert "operations-based sync is disabled" in second.json()["detail"].lower()

    count = await test_db.count_lines.count_documents({"session_id": session_id})
    assert count == 0


@pytest.mark.asyncio
async def test_legacy_sync_operations_payload_is_rejected(
    async_client, test_db, authenticated_headers
):
    session_id = "sess-sync-duplicate"
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "warehouse": "Main Warehouse",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": now,
            "last_heartbeat": now,
        }
    )
    await test_db.count_lines.insert_one(
        {
            "id": "existing-line",
            "session_id": session_id,
            "item_code": "ITEM-1",
            "counted_qty": 2.0,
            "floor_no": "1",
            "rack_no": "A1",
            "status": "pending",
            "approval_status": "PENDING",
            "counted_by": "staff1",
            "counted_at": now,
        }
    )

    payload = {"operations": [_legacy_count_line_op("offline-line-2", session_id)]}
    response = await async_client.post(
        "/api/sync/batch",
        json=payload,
        headers=authenticated_headers,
    )

    assert response.status_code == 410
    body = response.json()
    assert "operations-based sync is disabled" in body["detail"].lower()
    count = await test_db.count_lines.count_documents({"session_id": session_id})
    assert count == 1


@pytest.mark.asyncio
async def test_legacy_sync_recount_payload_is_rejected(
    async_client, test_db, authenticated_headers
):
    session_id = "sess-sync-recount"
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "warehouse": "Main Warehouse",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": now,
            "last_heartbeat": now,
        }
    )
    await test_db.count_lines.insert_one(
        {
            "id": "rejected-line",
            "session_id": session_id,
            "item_code": "ITEM-1",
            "counted_qty": 2.0,
            "floor_no": "1",
            "rack_no": "A1",
            "status": "rejected",
            "approval_status": "REJECTED",
            "assigned_to": "staff1",
            "recount_requested_at": now,
            "counted_by": "staff1",
            "counted_at": now,
        }
    )

    payload = {
        "operations": [
            _legacy_count_line_op(
                "offline-line-3",
                session_id,
                counted_qty=9.0,
                recount_of_id="rejected-line",
                idempotency_key="recount-idem-1",
            )
        ]
    }
    response = await async_client.post(
        "/api/sync/batch",
        json=payload,
        headers=authenticated_headers,
    )

    assert response.status_code == 410
    body = response.json()
    assert "operations-based sync is disabled" in body["detail"].lower()

    count = await test_db.count_lines.count_documents({"session_id": session_id})
    assert count == 1

    line = await test_db.count_lines.find_one({"id": "rejected-line"})
    assert line is not None
    assert line["counted_qty"] == 2.0
    assert line["status"] == "rejected"
