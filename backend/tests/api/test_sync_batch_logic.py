from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.api.sync_batch_api import SyncRecord, _process_count_line_op, sync_single_record


@pytest.mark.asyncio
async def test_sync_single_record_scopes_upsert_by_session_id(monkeypatch):
    db = MagicMock()
    db.count_lines.find_one = AsyncMock(return_value=None)
    db.item_serials.insert_many = AsyncMock(return_value=None)

    lifecycle_service = SimpleNamespace(
        ensure_session_active=AsyncMock(
            return_value={
                "id": "session-a",
                "session_id": "session-a",
                "status": "ACTIVE",
                "staff_user": "staff1",
            }
        )
    )
    write_service = SimpleNamespace(process_write=AsyncMock(return_value=None))
    monkeypatch.setattr(
        "backend.api.sync_batch_api.find_duplicate_count_line",
        AsyncMock(return_value=None),
    )

    record = SyncRecord(
        record_id="offline-line-1",
        client_record_id="offline-line-1",
        session_id="session-a",
        location_id="showroom",
        floor_id="1",
        rack_id="A1",
        item_code="ITEM-1",
        verified_qty=3,
        created_at=datetime.now(timezone.utc).isoformat(),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )

    success, error = await sync_single_record(
        record,
        db,
        "staff1",
        write_service=write_service,
        lifecycle_service=lifecycle_service,
    )

    assert success is True
    assert error is None
    filter_query = db.count_lines.find_one.await_args.args[0]
    assert filter_query == {
        "session_id": "session-a",
        "idempotency_key": "offline-line-1",
    }
    write_payload = write_service.process_write.await_args.args[0]["document"]
    assert write_payload["idempotency_key"] == "offline-line-1"
    assert write_payload["session_id"] == "session-a"


@pytest.mark.asyncio
async def test_process_count_line_op_accepts_non_dict_audit_metadata(monkeypatch):
    db = MagicMock()
    db.count_lines.find_one = AsyncMock(return_value=None)

    fake_session = {"id": "session-a", "session_id": "session-a", "status": "ACTIVE"}
    write_service = SimpleNamespace(process_write=AsyncMock(return_value=None))

    class _LifecycleService:
        def __init__(self, _db):
            self._db = _db

        async def ensure_session_active(self, session_id):
            assert session_id == "session-a"
            return dict(fake_session)

    monkeypatch.setattr("backend.api.sync_batch_api.SessionLifecycleService", _LifecycleService)
    monkeypatch.setattr(
        "backend.api.sync_batch_api.CountLineWriteService", lambda _db: write_service
    )

    monkeypatch.setattr(
        "backend.api.sync_batch_api.find_duplicate_count_line",
        AsyncMock(return_value=None),
    )

    message = await _process_count_line_op(
        {
            "_id": "legacy-id",
            "session_id": "session-a",
            "location_id": "showroom",
            "floor_id": "1",
            "rack_id": "A1",
            "item_code": "ITEM-1",
            "counted_qty": 2,
            "audit": None,
        },
        {"username": "staff1"},
        {},
        db,
    )

    assert message == "Count line synced with canonical duplicate validation"
    inserted = write_service.process_write.await_args.args[0]["document"]
    assert inserted["idempotency_key"] == "legacy-id"


@pytest.mark.asyncio
async def test_process_count_line_op_drops_object_id_from_recount_update(monkeypatch):
    db = MagicMock()
    db.count_lines.find_one = AsyncMock(return_value=None)
    db.client = MagicMock()

    fake_session = {
        "id": "session-a",
        "session_id": "session-a",
        "status": "ACTIVE",
        "staff_user": "staff1",
    }
    write_service = SimpleNamespace(process_write=AsyncMock(return_value=None))

    class _LifecycleService:
        def __init__(self, _db):
            self._db = _db

        async def ensure_session_active(self, session_id):
            assert session_id == "session-a"
            return dict(fake_session)

    monkeypatch.setattr("backend.api.sync_batch_api.SessionLifecycleService", _LifecycleService)
    monkeypatch.setattr(
        "backend.api.sync_batch_api.CountLineWriteService", lambda _db: write_service
    )

    monkeypatch.setattr(
        "backend.api.sync_batch_api.find_duplicate_count_line",
        AsyncMock(
            return_value={
                "_id": "mongo-id",
                "id": "rejected-line",
                "status": "rejected",
                "approval_status": "REJECTED",
                "version": 1,
            }
        ),
    )
    monkeypatch.setattr(
        "backend.api.sync_batch_api.can_reuse_rejected_count_line",
        lambda *_args, **_kwargs: True,
    )

    @asynccontextmanager
    async def _fake_transaction(_client):
        yield None

    monkeypatch.setattr("backend.api.sync_batch_api.mongo_transaction", _fake_transaction)

    message = await _process_count_line_op(
        {
            "_id": "legacy-id",
            "session_id": "session-a",
            "location_id": "showroom",
            "floor_id": "1",
            "rack_id": "A1",
            "item_code": "ITEM-1",
            "counted_qty": 5,
            "recount_of_id": "rejected-line",
        },
        {"username": "staff1"},
        {},
        db,
    )

    assert message == "Rejected count line superseded by new recount version"
    assert write_service.process_write.await_count == 2
    insert_payload = write_service.process_write.await_args_list[0].args[0]["document"]
    assert "_id" not in insert_payload
    assert insert_payload["status"] == "pending"
    update_payload = write_service.process_write.await_args_list[1].args[0]["update"]["$set"]
    assert update_payload["status"] == "SUPERSEDED"
