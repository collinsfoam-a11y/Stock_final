"""
FIX GROUP 2 — Regression tests: Conflict merge quantity must replace, not accumulate.

current=10, incoming=12 → result MUST be 12, never 22.
"""

from unittest.mock import AsyncMock, MagicMock
import pytest

from backend.services.sync_conflicts_service import ConflictResolution, SyncConflictsService


def _make_db_with_line(line_doc: dict) -> MagicMock:
    db = MagicMock()
    db.client = None
    db.sync_conflicts.update_one = AsyncMock(return_value=None)
    db.count_lines.find_one = AsyncMock(return_value=line_doc)
    return db


def _make_service(db: MagicMock, resolved_data: dict, entity_id: str) -> SyncConflictsService:
    service = SyncConflictsService(db)
    service.count_line_write_service.process_write = AsyncMock(return_value=None)
    service.event_service.record_sync_queue_event = AsyncMock(return_value=None)
    service.get_conflict_by_id = AsyncMock(
        return_value={
            "id": "507f1f77bcf86cd799439011",
            "status": "pending",
            "entity_type": "count_line",
            "entity_id": entity_id,
            "server_data": resolved_data,
            "local_data": resolved_data,
        }
    )
    return service


@pytest.mark.asyncio
async def test_single_update_replaces_not_adds():
    """current=10, incoming=12 → final must be 12, NOT 22."""
    entity_id = "line-qty-replace"
    db = _make_db_with_line(
        {
            "id": entity_id,
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 10.0,
        }
    )
    service = _make_service(db, {"counted_qty": 12.0}, entity_id)

    await service.resolve_conflict(
        "507f1f77bcf86cd799439011",
        ConflictResolution.ACCEPT_SERVER,
        "supervisor1",
    )

    call_args = service.count_line_write_service.process_write.await_args
    update = call_args.args[0]["update"]

    # Must use $set with the absolute value, never $inc.
    assert "$set" in update, "Expected $set in update"
    assert update["$set"].get("counted_qty") == 12.0, (
        f"Expected counted_qty=12.0, got {update['$set'].get('counted_qty')}"
    )
    assert "$inc" not in update, (
        "REGRESSION: $inc must not be used for absolute quantity replacement"
    )


@pytest.mark.asyncio
async def test_repeated_update_stays_idempotent():
    """Resolving the same conflict twice must not double the quantity."""
    entity_id = "line-qty-repeat"
    db = _make_db_with_line(
        {
            "id": entity_id,
            "session_id": "sess-1",
            "item_code": "ITEM-2",
            "counted_qty": 10.0,
        }
    )

    for _ in range(3):
        service = _make_service(db, {"counted_qty": 12.0}, entity_id)
        await service.resolve_conflict(
            "507f1f77bcf86cd799439011",
            ConflictResolution.ACCEPT_SERVER,
            "supervisor1",
        )
        call_args = service.count_line_write_service.process_write.await_args
        update = call_args.args[0]["update"]
        assert "$inc" not in update
        assert update["$set"].get("counted_qty") == 12.0


@pytest.mark.asyncio
async def test_equal_incoming_no_qty_written():
    """If incoming == current, no counted_qty field should be in $set."""
    entity_id = "line-qty-same"
    db = _make_db_with_line(
        {
            "id": entity_id,
            "session_id": "sess-1",
            "item_code": "ITEM-3",
            "counted_qty": 10.0,
        }
    )
    service = _make_service(db, {"counted_qty": 10.0}, entity_id)

    await service.resolve_conflict(
        "507f1f77bcf86cd799439011",
        ConflictResolution.ACCEPT_SERVER,
        "supervisor1",
    )

    call_args = service.count_line_write_service.process_write.await_args
    update = call_args.args[0]["update"]
    assert "$inc" not in update
    # counted_qty should not be rewritten when values are equal.
    assert update["$set"].get("counted_qty") is None or "$set" not in update


@pytest.mark.asyncio
async def test_conflict_resolved_flag_is_set():
    """conflict_resolved must be True on every accepted resolution."""
    entity_id = "line-flag"
    db = _make_db_with_line(
        {
            "id": entity_id,
            "session_id": "sess-1",
            "item_code": "ITEM-4",
            "counted_qty": 5.0,
        }
    )
    service = _make_service(db, {"counted_qty": 8.0}, entity_id)

    await service.resolve_conflict(
        "507f1f77bcf86cd799439011",
        ConflictResolution.ACCEPT_SERVER,
        "supervisor1",
    )

    call_args = service.count_line_write_service.process_write.await_args
    update = call_args.args[0]["update"]["$set"]
    assert update.get("conflict_resolved") is True
