import pytest

from backend.services.event_service import EventService
from backend.services.projection_service import PROJECTION_VERSION
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_append_scan_event_projects_inventory_snapshots():
    db = InMemoryDatabase()
    service = EventService(db)

    event = await service.append_event(
        aggregate_id="ITEM-1",
        event_type="SCAN_ADDED",
        payload={
            "session_id": "sess-1",
            "item_id": "ITEM-1",
            "batch_id": "BATCH-1",
            "count_line": {
                "id": "line-1",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "item_name": "Widget",
                "batch_id": "BATCH-1",
                "counted_qty": 4.5,
                "damaged_qty": 1.0,
                "serial_numbers": ["sn-1", "SN-2"],
                "erp_qty": 2.0,
                "current_sql_qty": 3.0,
                "baseline_hash": "base-1",
            },
            "after": {
                "id": "line-1",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "item_name": "Widget",
                "batch_id": "BATCH-1",
                "counted_qty": 4.5,
                "damaged_qty": 1.0,
                "serial_numbers": ["sn-1", "SN-2"],
                "erp_qty": 2.0,
                "current_sql_qty": 3.0,
                "baseline_hash": "base-1",
            },
            "delta": {"counted_qty": 4.5, "damaged_qty": 1.0, "serial_count": 2},
        },
        metadata={"event_idempotency_key": "scan-1"},
    )

    snapshot = await db.items_snapshot.find_one({"session_id": "sess-1", "item_code": "ITEM-1"})
    batch = await db.batch_records.find_one(
        {"session_id": "sess-1", "item_code": "ITEM-1", "batch_id": "BATCH-1"}
    )
    serial = await db.serial_registry.find_one({"serial_no": "SN-1"})
    erp_snapshot = await db.erp_snapshot.find_one({"session_id": "sess-1", "item_code": "ITEM-1"})
    event_applied = await db.event_applied.find_one({"event_id": event["_id"]})

    assert event["event_type"] == "SCAN_ADDED"
    assert snapshot["counted_qty"] == pytest.approx(4.5)
    assert snapshot["damaged_qty"] == pytest.approx(1.0)
    assert batch["counted_qty"] == pytest.approx(4.5)
    assert serial["item_code"] == "ITEM-1"
    assert erp_snapshot["baseline_qty"] == pytest.approx(2.0)
    assert snapshot["projection_version"] == PROJECTION_VERSION
    assert batch["projection_version"] == PROJECTION_VERSION
    assert serial["projection_version"] == PROJECTION_VERSION
    assert erp_snapshot["projection_version"] == PROJECTION_VERSION
    assert event_applied["projection_version"] == PROJECTION_VERSION


@pytest.mark.asyncio
async def test_append_event_is_idempotent_for_duplicate_retry():
    db = InMemoryDatabase()
    service = EventService(db)

    payload = {
        "session_id": "sess-1",
        "item_id": "ITEM-1",
        "batch_id": "BATCH-1",
        "count_line": {
            "id": "line-1",
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 2.0,
        },
        "after": {
            "id": "line-1",
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 2.0,
        },
        "delta": {"counted_qty": 2.0, "damaged_qty": 0.0, "serial_count": 0},
    }

    first = await service.append_event(
        aggregate_id="ITEM-1",
        event_type="SCAN_ADDED",
        payload=payload,
        metadata={"event_idempotency_key": "retry-1"},
    )
    second = await service.append_event(
        aggregate_id="ITEM-1",
        event_type="SCAN_ADDED",
        payload=payload,
        metadata={"event_idempotency_key": "retry-1"},
    )

    snapshot = await db.items_snapshot.find_one({"session_id": "sess-1", "item_code": "ITEM-1"})
    events = await db.event_log.find({}).to_list(length=10)

    assert first["_id"] == second["_id"]
    assert len(events) == 1
    assert snapshot["counted_qty"] == pytest.approx(2.0)


@pytest.mark.asyncio
async def test_append_event_omits_nullable_sparse_index_fields():
    db = InMemoryDatabase()
    service = EventService(db)

    event = await service.append_event(
        aggregate_id="ITEM-1",
        event_type="VARIANCE_DETECTED",
        payload={
            "session_id": "sess-1",
            "item_id": "ITEM-1",
            "count_line": {
                "id": "line-1",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
            },
        },
        metadata={"event_idempotency_key": "variance-1", "scan_fingerprint": None},
    )

    stored = await db.event_log.find_one({"_id": event["_id"]})

    assert "scan_fingerprint" not in stored
    assert "request_idempotency_key" not in stored
    assert "scan_fingerprint" not in stored["metadata"]
    assert "request_idempotency_key" not in stored["metadata"]


@pytest.mark.asyncio
async def test_append_scan_event_projects_batch_array_totals():
    db = InMemoryDatabase()
    service = EventService(db)

    await service.append_event(
        aggregate_id="ITEM-1",
        event_type="SCAN_ADDED",
        payload={
            "session_id": "sess-1",
            "item_id": "ITEM-1",
            "count_line": {
                "id": "line-1",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "item_name": "Widget",
                "counted_qty": 5.0,
                "batches": [
                    {"batch_id": "B1", "batch_no": "B1", "quantity": 2.0},
                    {"batch_id": "B2", "batch_no": "B2", "quantity": 3.0},
                ],
            },
            "after": {
                "id": "line-1",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "item_name": "Widget",
                "counted_qty": 5.0,
                "batches": [
                    {"batch_id": "B1", "batch_no": "B1", "quantity": 2.0},
                    {"batch_id": "B2", "batch_no": "B2", "quantity": 3.0},
                ],
            },
            "delta": {"counted_qty": 5.0, "damaged_qty": 0.0, "serial_count": 0},
        },
        metadata={"event_idempotency_key": "scan-batches-1"},
    )

    batch_one = await db.batch_records.find_one(
        {"session_id": "sess-1", "item_code": "ITEM-1", "batch_id": "B1"}
    )
    batch_two = await db.batch_records.find_one(
        {"session_id": "sess-1", "item_code": "ITEM-1", "batch_id": "B2"}
    )

    assert batch_one["counted_qty"] == pytest.approx(2.0)
    assert batch_two["counted_qty"] == pytest.approx(3.0)
