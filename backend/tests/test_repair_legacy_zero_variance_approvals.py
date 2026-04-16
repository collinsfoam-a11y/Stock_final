from datetime import datetime, timezone

import pytest

from backend.scripts.repair_legacy_zero_variance_approvals import (
    repair_legacy_zero_variance_approvals,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_repair_legacy_zero_variance_approvals_updates_pending_exact_matches():
    db = InMemoryDatabase()
    counted_at = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.count_lines.insert_one(
        {
            "id": "line-1",
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "variance": 0.0,
            "status": "pending",
            "approval_status": "PENDING",
            "counted_at": counted_at,
        }
    )
    await db.count_lines.insert_one(
        {
            "id": "line-2",
            "session_id": "sess-1",
            "item_code": "ITEM-2",
            "variance": 1.0,
            "status": "pending",
            "approval_status": "NEEDS_REVIEW",
            "counted_at": counted_at,
        }
    )

    stats = await repair_legacy_zero_variance_approvals(db, dry_run=False)

    assert stats["scanned"] == 2
    assert stats["candidates"] == 1
    assert stats["repairable"] == 1
    assert stats["repaired"] == 1

    repaired = await db.count_lines.find_one({"id": "line-1"})
    assert repaired["status"] == "approved"
    assert repaired["approval_status"] == "APPROVED"
    assert repaired["approved_by"] == "system"
    assert repaired["approved_at"] == counted_at

    untouched = await db.count_lines.find_one({"id": "line-2"})
    assert untouched["status"] == "pending"
    assert untouched["approval_status"] == "NEEDS_REVIEW"


@pytest.mark.asyncio
async def test_repair_legacy_zero_variance_approvals_dry_run_leaves_rows_unchanged():
    db = InMemoryDatabase()
    counted_at = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.count_lines.insert_one(
        {
            "id": "line-1",
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "variance": 0.0,
            "status": "pending",
            "approval_status": "PENDING",
            "counted_at": counted_at,
        }
    )

    stats = await repair_legacy_zero_variance_approvals(db, dry_run=True)

    assert stats["candidates"] == 1
    assert stats["repaired"] == 0

    original = await db.count_lines.find_one({"id": "line-1"})
    assert original["status"] == "pending"
    assert original["approval_status"] == "PENDING"
