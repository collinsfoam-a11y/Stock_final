from __future__ import annotations

from datetime import datetime, timezone

import pytest

from backend.scripts.backfill_item_projection_collections import (
    BATCH_COLLECTION,
    FINANCIAL_COLLECTION,
    VARIANCE_COLLECTION,
    VERIFIED_COLLECTION,
    backfill_item_projection_collections,
    build_verified_item_projection_row,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _count_line(**overrides):
    base = {
        "id": "line-1",
        "session_id": "sess-1",
        "item_code": "ITEM-1",
        "item_name": "Item 1",
        "barcode": "BC-1",
        "erp_qty": 2,
        "counted_qty": 5,
        "variance": 3,
        "financial_impact": 30,
        "approval_status": "APPROVED",
        "status": "approved",
        "batch_no": "BATCH-1",
        "counted_at": _now(),
        "counted_by": "staff",
        "mrp_erp": 10,
        "mrp_counted": 10,
    }
    base.update(overrides)
    return base


def test_build_verified_item_projection_row_uses_canonical_line_fields():
    row = build_verified_item_projection_row(
        _count_line(),
        {"id": "sess-1", "warehouse": "Main"},
        {"event_id": "evt-1", "event_type": "SCAN_ADDED"},
        now=_now(),
    )

    assert row["count_line_id"] == "line-1"
    assert row["session_id"] == "sess-1"
    assert row["item_code"] == "ITEM-1"
    assert row["counted_qty"] == 5
    assert row["variance"] == 3
    assert row["financial_impact"] == 30
    assert row["approval_status"] == "APPROVED"
    assert row["verified"] is True
    assert row["warehouse"] == "Main"


@pytest.mark.asyncio
async def test_item_projection_backfill_dry_run_does_not_insert_rows():
    db = InMemoryDatabase()
    await db.sessions.insert_one({"id": "sess-1", "warehouse": "Main"})
    await db.count_lines.insert_one(_count_line())

    report = await backfill_item_projection_collections(db, dry_run=True)

    assert report["missing_verified_items"] == 1
    assert report["missing_variance_items"] == 1
    assert report["missing_batch_rows"] == 1
    assert report["missing_financial_rows"] == 1
    assert report["inserted_verified_items"] == 0
    assert await db[VERIFIED_COLLECTION].count_documents({}) == 0
    assert await db[VARIANCE_COLLECTION].count_documents({}) == 0
    assert await db[BATCH_COLLECTION].count_documents({}) == 0
    assert await db[FINANCIAL_COLLECTION].count_documents({}) == 0


@pytest.mark.asyncio
async def test_item_projection_backfill_execute_inserts_missing_rows():
    db = InMemoryDatabase()
    await db.sessions.insert_one({"id": "sess-1", "warehouse": "Main"})
    await db.count_lines.insert_one(_count_line())

    report = await backfill_item_projection_collections(db, dry_run=False)

    assert report["inserted_verified_items"] == 1
    assert report["inserted_variance_items"] == 1
    assert report["inserted_batch_rows"] == 1
    assert report["inserted_financial_rows"] == 1
    verified = await db[VERIFIED_COLLECTION].find_one({"count_line_id": "line-1"})
    variance = await db[VARIANCE_COLLECTION].find_one({"count_line_id": "line-1"})
    batch = await db[BATCH_COLLECTION].find_one({"count_line_id": "line-1"})
    financial = await db[FINANCIAL_COLLECTION].find_one({"session_id": "sess-1"})
    assert verified["variance"] == 3
    assert variance["variance"] == 3
    assert batch["batch_no"] == "BATCH-1"
    assert financial["total_counted_qty"] == 5


@pytest.mark.asyncio
async def test_item_projection_backfill_does_not_overwrite_existing_rows():
    db = InMemoryDatabase()
    await db.sessions.insert_one({"id": "sess-1", "warehouse": "Main"})
    await db.count_lines.insert_one(_count_line())
    await db[VERIFIED_COLLECTION].insert_one(
        {"count_line_id": "line-1", "session_id": "sess-1", "item_code": "ITEM-1"}
    )
    await db[VARIANCE_COLLECTION].insert_one(
        {"count_line_id": "line-1", "session_id": "sess-1", "item_code": "ITEM-1"}
    )
    await db[BATCH_COLLECTION].insert_one(
        {
            "count_line_id": "line-1",
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "batch_no": "BATCH-1",
        }
    )
    await db[FINANCIAL_COLLECTION].insert_one({"session_id": "sess-1"})

    report = await backfill_item_projection_collections(db, dry_run=False)

    assert report["inserted_verified_items"] == 0
    assert report["inserted_variance_items"] == 0
    assert report["inserted_batch_rows"] == 0
    assert report["inserted_financial_rows"] == 0
    assert await db[VERIFIED_COLLECTION].count_documents({}) == 1
    assert await db[VARIANCE_COLLECTION].count_documents({}) == 1
    assert await db[BATCH_COLLECTION].count_documents({}) == 1
    assert await db[FINANCIAL_COLLECTION].count_documents({}) == 1
