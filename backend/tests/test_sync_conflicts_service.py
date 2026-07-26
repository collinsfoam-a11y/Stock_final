from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.models.audit import AuditEventType
from backend.services.sync_conflicts_service import ConflictResolution, SyncConflictsService


@pytest.mark.asyncio
async def test_resolve_conflict_handles_non_object_id_entity_ids():
    db = MagicMock()
    db.client = None
    db.sync_conflicts.update_one = AsyncMock(return_value=None)
    db.count_lines.find_one = AsyncMock(
        return_value={"id": "offline-line-1", "session_id": "sess-1"}
    )

    service = SyncConflictsService(db)
    service.count_line_write_service.process_write = AsyncMock(return_value=None)
    service.event_service.record_sync_queue_event = AsyncMock(return_value=None)
    service.get_conflict_by_id = AsyncMock(
        return_value={
            "id": "507f1f77bcf86cd799439011",
            "status": "pending",
            "entity_type": "count_line",
            "entity_id": "offline-line-1",
            "session_id": "sess-1",
            "server_data": {"field": "server"},
            "local_data": {"field": "local"},
        }
    )

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with patch("backend.services.audit_service.AuditService", return_value=audit_service):
        result = await service.resolve_conflict(
            "507f1f77bcf86cd799439011",
            ConflictResolution.ACCEPT_SERVER,
            "supervisor1",
        )

    assert result["resolution"] == ConflictResolution.ACCEPT_SERVER.value
    assert db.count_lines.find_one.await_args.args[0] == {"id": "offline-line-1"}
    process_write_call = service.count_line_write_service.process_write.await_args
    assert process_write_call.args[0]["filter"] == {"id": "offline-line-1"}

    audit_service.log_event.assert_awaited_once()
    kwargs = audit_service.log_event.await_args.kwargs
    assert kwargs["event_type"] == AuditEventType.SYNC_CONFLICT_RESOLVED
    assert kwargs["entity_id"] == "offline-line-1"
    assert kwargs["actor_username"] == "supervisor1"
    assert kwargs["decision"] == "accept_server"


@pytest.mark.asyncio
async def test_detect_conflict_writes_canonical_audit_event():
    db = MagicMock()
    db.sync_conflicts.insert_one = AsyncMock(return_value=MagicMock(inserted_id="conflict-id-1"))

    service = SyncConflictsService(db)
    service.event_service.record_sync_queue_event = AsyncMock(return_value=None)

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with patch("backend.services.audit_service.AuditService", return_value=audit_service):
        conflict_id = await service.detect_conflict(
            entity_type="count_line",
            entity_id="line-1",
            local_data={"counted_qty": 5},
            server_data={"counted_qty": 3},
            user="staff1",
            session_id="sess-1",
        )

    assert conflict_id == "conflict-id-1"
    audit_service.log_event.assert_awaited_once()
    kwargs = audit_service.log_event.await_args.kwargs
    assert kwargs["event_type"] == AuditEventType.SYNC_CONFLICT_CREATED
    assert kwargs["entity_type"] == "count_line"
    assert kwargs["entity_id"] == "line-1"
    assert kwargs["session_id"] == "sess-1"
    assert kwargs["actor_username"] == "staff1"


@pytest.mark.asyncio
async def test_resolve_conflict_replaces_count_line_quantity():
    """
    FIX GROUP 2: Conflict resolution must REPLACE counted_qty, not ADD to it.
    current=3, incoming=2 → result must be 2, NOT 5.
    """
    db = MagicMock()
    db.client = None
    db.sync_conflicts.update_one = AsyncMock(return_value=None)
    db.count_lines.find_one = AsyncMock(
        return_value={
            "id": "line-qty-1",
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 3.0,
            "batches": [{"batch_id": "B1"}],
        }
    )

    service = SyncConflictsService(db)
    service.count_line_write_service.process_write = AsyncMock(return_value=None)
    service.validation_service.assert_item_serial_uniqueness = AsyncMock(return_value=None)
    service.event_service.record_sync_queue_event = AsyncMock(return_value=None)
    service.get_conflict_by_id = AsyncMock(
        return_value={
            "id": "507f1f77bcf86cd799439012",
            "status": "pending",
            "entity_type": "count_line",
            "entity_id": "line-qty-1",
            "server_data": {"counted_qty": 2.0},
            "local_data": {"counted_qty": 2.0},
        }
    )

    await service.resolve_conflict(
        "507f1f77bcf86cd799439012",
        ConflictResolution.ACCEPT_SERVER,
        "supervisor1",
    )

    update_doc = service.count_line_write_service.process_write.await_args.args[0]["update"]
    # Must use $set for absolute replacement, never $inc.
    assert "$inc" not in update_doc, "REGRESSION: $inc must not be used for quantity replacement"
    assert update_doc.get("$set", {}).get("counted_qty") == pytest.approx(2.0)


@pytest.mark.asyncio
async def test_get_conflicts_paginates_beyond_limit():
    """SYNC-06: with >100 conflicts, callers can page past the per-request cap
    (offset → skip) and learn the true total via count_conflicts."""

    class _FakeCursor:
        def __init__(self, docs):
            self._docs = docs

        def sort(self, *_args, **_kwargs):
            return self

        def skip(self, n):
            self._docs = self._docs[n:]
            return self

        def limit(self, n):
            self._docs = self._docs[:n]
            return self

        async def to_list(self, length=None):
            return [dict(d) for d in self._docs[:length]]

    all_conflicts = [{"_id": f"id{i}", "status": "pending"} for i in range(250)]

    db = MagicMock()
    db.sync_conflicts.find = MagicMock(
        side_effect=lambda *_a, **_k: _FakeCursor(list(all_conflicts))
    )
    db.sync_conflicts.count_documents = AsyncMock(return_value=len(all_conflicts))

    service = SyncConflictsService(db)

    total = await service.count_conflicts()
    page1 = await service.get_conflicts(limit=100, offset=0)
    page2 = await service.get_conflicts(limit=100, offset=100)
    page3 = await service.get_conflicts(limit=100, offset=200)

    assert total == 250
    assert len(page1) == 100 and len(page2) == 100 and len(page3) == 50
    assert page1[0]["id"] == "id0"
    assert page2[0]["id"] == "id100"
    assert page3[0]["id"] == "id200"


@pytest.mark.asyncio
async def test_resolve_conflict_rejects_serial_merges():
    db = MagicMock()
    db.client = None
    db.sync_conflicts.update_one = AsyncMock(return_value=None)
    db.count_lines.find_one = AsyncMock(
        return_value={
            "id": "line-serial-1",
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 1.0,
            "serial_numbers": ["SER-1"],
        }
    )

    service = SyncConflictsService(db)
    service.count_line_write_service.process_write = AsyncMock(return_value=None)
    service.event_service.record_sync_queue_event = AsyncMock(return_value=None)
    service.get_conflict_by_id = AsyncMock(
        return_value={
            "id": "507f1f77bcf86cd799439013",
            "status": "pending",
            "entity_type": "count_line",
            "entity_id": "line-serial-1",
            "server_data": {"serial_numbers": ["SER-2"]},
            "local_data": {"serial_numbers": ["SER-2"]},
        }
    )

    with pytest.raises(ValueError, match="SERIAL_CONFLICT_REJECTED"):
        await service.resolve_conflict(
            "507f1f77bcf86cd799439013",
            ConflictResolution.ACCEPT_SERVER,
            "supervisor1",
        )
