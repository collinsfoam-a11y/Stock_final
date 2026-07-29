from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.api.sync_batch_api import (
    SyncRecord,
    _process_count_line_op,
    sync_single_record,
    validate_record,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase


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

    class FakeUOW:
        def __init__(self, client):
            self.session = None
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    monkeypatch.setattr("backend.api.sync_batch_api.MongoUnitOfWork", FakeUOW)

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


def _finalized_record() -> SyncRecord:
    now = datetime.now(timezone.utc).isoformat()
    return SyncRecord(
        client_record_id="offline-final-1",
        session_id="session-a",
        location_id="showroom",
        floor_id="1",
        rack_id="A1",
        item_code="ITEM-1",
        verified_qty=3,
        status="finalized",
        created_at=now,
        updated_at=now,
    )


def _sync_harness(monkeypatch):
    db = MagicMock()
    db.count_lines.find_one = AsyncMock(return_value=None)
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
    return db, lifecycle_service, write_service


@pytest.mark.asyncio
async def test_staff_cannot_self_approve_finalized_via_sync(monkeypatch):
    """AUTH-02: a staff (non-supervisor) `finalized` payload may record the count
    as verified, but must NEVER self-approve/self-finalize — approval authority
    (approval_status=APPROVED + finalized_by) is reserved for supervisors/admins."""
    db, lifecycle_service, write_service = _sync_harness(monkeypatch)

    success, error = await sync_single_record(
        _finalized_record(),
        db,
        "staff1",
        user_role="staff",
        write_service=write_service,
        lifecycle_service=lifecycle_service,
    )

    assert success is True and error is None
    doc = write_service.process_write.await_args.args[0]["document"]
    # Approval authority is withheld from staff...
    assert doc["approval_status"] != "APPROVED"
    assert doc["finalized_by"] is None
    assert doc["finalized_at"] is None
    # ...while the count itself is still recorded (no workflow disruption).
    assert doc["verified"] is True


@pytest.mark.asyncio
async def test_supervisor_may_finalize_via_sync(monkeypatch):
    """A supervisor retains authority to finalize + approve through the sync path."""
    db, lifecycle_service, write_service = _sync_harness(monkeypatch)

    success, error = await sync_single_record(
        _finalized_record(),
        db,
        "supervisor1",
        user_role="supervisor",
        write_service=write_service,
        lifecycle_service=lifecycle_service,
    )

    assert success is True and error is None
    doc = write_service.process_write.await_args.args[0]["document"]
    assert doc["approval_status"] == "APPROVED"
    assert doc["verified"] is True
    assert doc["finalized_by"] == "supervisor1"
    assert doc["status"] == "locked"


@pytest.mark.asyncio
async def test_validate_record_allows_same_serial_for_different_item():
    db = InMemoryDatabase()
    await db.item_serials.insert_one({"serial_number": "SER-1", "item_code": "ITEM-1"})

    record = SyncRecord(
        client_record_id="offline-line-2",
        session_id="session-a",
        location_id="showroom",
        floor_id="1",
        rack_id="A1",
        item_code="ITEM-2",
        verified_qty=1,
        serial_numbers=["ser-1"],
        created_at=datetime.now(timezone.utc).isoformat(),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    lock_manager = SimpleNamespace(get_rack_lock_owner=AsyncMock(return_value=None))

    conflict = await validate_record(record, db, lock_manager)

    assert conflict is None


@pytest.mark.asyncio
async def test_validate_record_blocks_same_serial_for_same_item():
    db = InMemoryDatabase()
    await db.item_serials.insert_one({"serial_number": "SER-1", "item_code": "ITEM-1"})

    record = SyncRecord(
        client_record_id="offline-line-3",
        session_id="session-a",
        location_id="showroom",
        floor_id="1",
        rack_id="A1",
        item_code="ITEM-1",
        verified_qty=1,
        serial_numbers=["ser-1"],
        created_at=datetime.now(timezone.utc).isoformat(),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    lock_manager = SimpleNamespace(get_rack_lock_owner=AsyncMock(return_value=None))

    conflict = await validate_record(record, db, lock_manager)

    assert conflict is not None
    assert conflict.conflict_type == "duplicate_serial"
    assert conflict.message == "Serial already exists for this item."
