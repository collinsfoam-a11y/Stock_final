import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.services.sync_conflicts_service import ConflictResolution, SyncConflictsService


@pytest.mark.asyncio
async def test_resolve_conflict_handles_non_object_id_entity_ids():
    db = MagicMock()
    db.client = None
    db.sync_conflicts.update_one = AsyncMock(return_value=MagicMock(matched_count=1))
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
async def test_resolve_conflict_sets_count_line_quantity_absolutely():
    db = MagicMock()
    db.client = None
    db.sync_conflicts.update_one = AsyncMock(return_value=MagicMock(matched_count=1))
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
    assert update_doc["$set"]["counted_qty"] == pytest.approx(2.0)


@pytest.mark.asyncio
async def test_resolve_conflict_rejects_serial_merges():
    db = MagicMock()
    db.client = None
    db.sync_conflicts.update_one = AsyncMock(return_value=MagicMock(matched_count=1))
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


@pytest.mark.asyncio
async def test_resolve_conflict_is_idempotent_on_retry():
    db = MagicMock()
    db.client = None
    db.sync_conflicts.update_one = AsyncMock(
        side_effect=[MagicMock(matched_count=1), MagicMock(matched_count=0)]
    )
    db.sync_conflicts.find_one = AsyncMock(
        return_value={
            "resolution": ConflictResolution.ACCEPT_SERVER.value,
            "resolved_data": {"counted_qty": 12.0},
        }
    )
    db.count_lines.find_one = AsyncMock(
        return_value={"id": "line-qty-2", "session_id": "sess-1", "item_code": "ITEM-1", "counted_qty": 10.0}
    )

    service = SyncConflictsService(db)
    service.count_line_write_service.process_write = AsyncMock(return_value=None)
    service.event_service.record_sync_queue_event = AsyncMock(return_value=None)
    service.get_conflict_by_id = AsyncMock(
        return_value={
            "id": "507f1f77bcf86cd799439021",
            "status": "pending",
            "entity_type": "count_line",
            "entity_id": "line-qty-2",
            "server_data": {"counted_qty": 12.0},
            "local_data": {"counted_qty": 12.0},
        }
    )

    result1 = await service.resolve_conflict(
        "507f1f77bcf86cd799439021",
        ConflictResolution.ACCEPT_SERVER,
        "supervisor1",
    )
    result2 = await service.resolve_conflict(
        "507f1f77bcf86cd799439021",
        ConflictResolution.ACCEPT_SERVER,
        "supervisor1",
    )

    assert result1["resolution"] == ConflictResolution.ACCEPT_SERVER.value
    assert result2["resolution"] == ConflictResolution.ACCEPT_SERVER.value
    assert service.count_line_write_service.process_write.await_count == 1


@pytest.mark.asyncio
async def test_resolve_conflict_is_idempotent_under_concurrency():
    db = MagicMock()
    db.client = None
    db.sync_conflicts.update_one = AsyncMock(
        side_effect=[MagicMock(matched_count=1), MagicMock(matched_count=0)]
    )
    db.sync_conflicts.find_one = AsyncMock(
        return_value={
            "resolution": ConflictResolution.ACCEPT_SERVER.value,
            "resolved_data": {"counted_qty": 12.0},
        }
    )
    db.count_lines.find_one = AsyncMock(
        return_value={"id": "line-qty-3", "session_id": "sess-1", "item_code": "ITEM-1", "counted_qty": 10.0}
    )

    service = SyncConflictsService(db)
    service.count_line_write_service.process_write = AsyncMock(return_value=None)
    service.event_service.record_sync_queue_event = AsyncMock(return_value=None)
    service.get_conflict_by_id = AsyncMock(
        return_value={
            "id": "507f1f77bcf86cd799439022",
            "status": "pending",
            "entity_type": "count_line",
            "entity_id": "line-qty-3",
            "server_data": {"counted_qty": 12.0},
            "local_data": {"counted_qty": 12.0},
        }
    )

    results = await asyncio.gather(
        service.resolve_conflict(
            "507f1f77bcf86cd799439022",
            ConflictResolution.ACCEPT_SERVER,
            "supervisor1",
        ),
        service.resolve_conflict(
            "507f1f77bcf86cd799439022",
            ConflictResolution.ACCEPT_SERVER,
            "supervisor1",
        ),
    )

    assert all(result["resolution"] == ConflictResolution.ACCEPT_SERVER.value for result in results)
    assert service.count_line_write_service.process_write.await_count == 1
