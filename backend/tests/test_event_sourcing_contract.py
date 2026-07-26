from datetime import datetime, timezone

import pytest

from backend.services.governance_guard import GovernanceViolation
from backend.services.projection_service import ProjectionService
from backend.services.validation_service import ValidationService
from backend.tests.utils.in_memory_db import InMemoryDatabase


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.mark.asyncio
async def test_serial_uniqueness_is_scoped_per_item():
    db = InMemoryDatabase()
    await db.serial_registry.insert_one(
        {
            "item_code": "ITEM-1",
            "serial_no": "SER-1",
            "count_line_id": "line-1",
        }
    )
    service = ValidationService(db)

    await service.assert_item_serial_uniqueness("ITEM-2", ["SER-1"])

    with pytest.raises(GovernanceViolation, match="SERIAL_DUPLICATE"):
        await service.assert_item_serial_uniqueness("ITEM-1", ["SER-1"])


def test_fractional_precision_uses_contract_error_code():
    db = InMemoryDatabase()
    service = ValidationService(db)

    with pytest.raises(GovernanceViolation, match="PRECISION_EXCEEDED"):
        service.normalize_quantity_for_item(
            item={
                "item_code": "ITEM-1",
                "uom_code": "KG",
                "base_uom": "KG",
                "allow_fraction": True,
                "uom_precision": 2,
            },
            doc={"item_code": "ITEM-1", "counted_qty": "1.234"},
        )


@pytest.mark.asyncio
async def test_projection_service_keeps_same_serial_for_different_items_distinct():
    db = InMemoryDatabase()
    service = ProjectionService(db)

    first_line = {
        "id": "line-1",
        "session_id": "sess-1",
        "item_code": "ITEM-1",
        "item_name": "Item One",
        "batch_id": "B1",
        "counted_qty": 1,
        "damaged_qty": 0,
        "serial_numbers": ["SER-1"],
    }
    second_line = {
        "id": "line-2",
        "session_id": "sess-1",
        "item_code": "ITEM-2",
        "item_name": "Item Two",
        "batch_id": "B1",
        "counted_qty": 1,
        "damaged_qty": 0,
        "serial_numbers": ["SER-1"],
    }

    await service.apply_event(
        {
            "_id": "evt-1",
            "event_type": "SCAN_ADDED",
            "timestamp": _utc_now(),
            "payload": {
                "session_id": "sess-1",
                "item_id": "ITEM-1",
                "batch_id": "B1",
                "count_line_id": "line-1",
                "count_line": first_line,
                "before": None,
                "after": first_line,
                "delta": {"counted_qty": 1, "damaged_qty": 0, "serial_count": 1},
            },
        }
    )
    await service.apply_event(
        {
            "_id": "evt-2",
            "event_type": "SCAN_ADDED",
            "timestamp": _utc_now(),
            "payload": {
                "session_id": "sess-1",
                "item_id": "ITEM-2",
                "batch_id": "B1",
                "count_line_id": "line-2",
                "count_line": second_line,
                "before": None,
                "after": second_line,
                "delta": {"counted_qty": 1, "damaged_qty": 0, "serial_count": 1},
            },
        }
    )

    registry_docs = await db.serial_registry.find({}).to_list(length=10)
    assert sorted((doc["item_code"], doc["serial_no"]) for doc in registry_docs) == [
        ("ITEM-1", "SER-1"),
        ("ITEM-2", "SER-1"),
    ]


@pytest.mark.asyncio
async def test_projection_rebuild_is_replay_safe():
    db = InMemoryDatabase()
    service = ProjectionService(db)
    event = {
        "_id": "evt-replay-1",
        "event_type": "SCAN_ADDED",
        "timestamp": _utc_now(),
        "payload": {
            "session_id": "sess-1",
            "item_id": "ITEM-1",
            "batch_id": "B1",
            "count_line_id": "line-1",
            "count_line": {
                "id": "line-1",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "item_name": "Widget",
                "batch_id": "B1",
                "counted_qty": 3,
                "damaged_qty": 0,
                "serial_numbers": ["SER-1", "SER-2", "SER-3"],
            },
            "after": {
                "id": "line-1",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "item_name": "Widget",
                "batch_id": "B1",
                "counted_qty": 3,
                "damaged_qty": 0,
                "serial_numbers": ["SER-1", "SER-2", "SER-3"],
            },
            "delta": {"counted_qty": 3, "damaged_qty": 0, "serial_count": 3},
        },
    }
    await db.event_log.insert_one(event)

    first = await service.rebuild_from_event_log(clear_existing=True)
    second = await service.rebuild_from_event_log(clear_existing=False)

    snapshot = await db.items_snapshot.find_one({"session_id": "sess-1", "item_code": "ITEM-1"})
    applied = await db.event_applied.find({}).to_list(length=10)

    assert first["applied_events"] == 1
    assert second["applied_events"] == 0
    assert snapshot["counted_qty"] == pytest.approx(3.0)
    assert len(applied) == 1
