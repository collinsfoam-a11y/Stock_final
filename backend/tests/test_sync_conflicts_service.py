from unittest.mock import AsyncMock, MagicMock

import pytest

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
            "server_data": {"field": "server"},
            "local_data": {"field": "local"},
        }
    )

    result = await service.resolve_conflict(
        "507f1f77bcf86cd799439011",
        ConflictResolution.ACCEPT_SERVER,
        "supervisor1",
    )

    assert result["resolution"] == ConflictResolution.ACCEPT_SERVER.value
    assert db.count_lines.find_one.await_args.args[0] == {"id": "offline-line-1"}
    process_write_call = service.count_line_write_service.process_write.await_args
    assert process_write_call.args[0]["filter"] == {"id": "offline-line-1"}


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
