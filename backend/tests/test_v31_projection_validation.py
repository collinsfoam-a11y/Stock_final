from __future__ import annotations

import pytest

from backend.scripts.v31_projection_validation import (
    build_projection_state_snapshot,
    build_projection_validation_report,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_projection_validation_reports_batch_projection_gap():
    db = InMemoryDatabase()
    await db.count_lines.insert_one(
        {
            "id": "line-1",
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 5.0,
            "damaged_qty": 0.0,
            "batches": [
                {"batch_id": "B1", "batch_no": "B1", "quantity": 2.0},
                {"batch_id": "B2", "batch_no": "B2", "quantity": 3.0},
            ],
            "status": "pending",
        }
    )
    await db.items_snapshot.insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 5.0,
            "damaged_qty": 0.0,
        }
    )
    await db.batch_records.insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "batch_id": "B1",
            "counted_qty": 2.0,
            "damaged_qty": 0.0,
        }
    )

    report = await build_projection_validation_report(db, session_id="sess-1")

    assert report["summary"]["batch_projection_gap_count"] == 1
    assert report["summary"]["legacy_batch_field_gap_count"] == 1
    assert report["batch_projection_gaps"][0]["error_code"] == "BATCH_PROJECTION_GAP"
    assert report["legacy_batch_field_gaps"][0]["missing_batch_id"] is True


@pytest.mark.asyncio
async def test_projection_state_snapshot_is_sorted_and_serialized():
    db = InMemoryDatabase()
    await db.items_snapshot.insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 2.0,
            "damaged_qty": 0.0,
        }
    )
    await db.batch_records.insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "batch_id": "B1",
            "counted_qty": 2.0,
            "damaged_qty": 0.0,
        }
    )
    await db.serial_registry.insert_many(
        [
            {"session_id": "sess-1", "item_code": "ITEM-1", "serial_no": "SN-2", "batch_id": "B1"},
            {"session_id": "sess-1", "item_code": "ITEM-1", "serial_no": "SN-1", "batch_id": "B1"},
        ]
    )

    snapshot = await build_projection_state_snapshot(db, session_id="sess-1")

    assert snapshot["items"][0]["serials"] == ["SN-1", "SN-2"]
    assert snapshot["serials"][0]["serial_no"] == "SN-1"
    assert snapshot["serials"][1]["serial_no"] == "SN-2"
