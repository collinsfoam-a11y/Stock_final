from datetime import datetime, timezone

import pytest

from backend.scripts.backfill_session_snapshots import backfill_empty_session_snapshots
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_backfill_empty_session_snapshots_repairs_snapshot_and_session_hash():
    db = InMemoryDatabase()
    started_at = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.sessions.insert_one(
        {
            "id": "sess-1",
            "session_id": "sess-1",
            "warehouse": "Showroom",
            "snapshot_hash": "stale-hash",
            "started_at": started_at,
            "status": "OPEN",
        }
    )
    await db.erp_items.insert_one(
        {
            "item_code": "ITEM-001",
            "stock_qty": 5,
            "warehouse": "Primary",
            "barcode": "111",
        }
    )
    await db.session_snapshots.insert_one(
        {
            "id": "snap-1",
            "session_id": "sess-1",
            "warehouse": "Showroom",
            "snapshot_hash": "stale-hash",
            "items": [],
            "item_count": 0,
            "config_version_id": "LEGACY_NO_VERSION",
            "created_at": started_at,
        }
    )

    stats = await backfill_empty_session_snapshots(db, dry_run=False)

    assert stats["scanned"] == 1
    assert stats["repairable"] == 1
    assert stats["repaired"] == 1
    assert stats["updated_sessions"] == 1

    snapshot_doc = await db.session_snapshots.find_one({"session_id": "sess-1"})
    assert snapshot_doc["item_count"] == 1
    assert snapshot_doc["items"][0]["item_code"] == "ITEM-001"
    assert snapshot_doc["snapshot_hash"] != "stale-hash"

    session_doc = await db.sessions.find_one({"id": "sess-1"})
    assert session_doc["snapshot_hash"] == snapshot_doc["snapshot_hash"]


@pytest.mark.asyncio
async def test_backfill_empty_session_snapshots_dry_run_leaves_documents_unchanged():
    db = InMemoryDatabase()
    started_at = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.sessions.insert_one(
        {
            "id": "sess-2",
            "warehouse": "Showroom",
            "snapshot_hash": "stale-hash",
            "started_at": started_at,
            "status": "OPEN",
        }
    )
    await db.erp_items.insert_one(
        {
            "item_code": "ITEM-002",
            "stock_qty": 3,
            "warehouse": "Primary",
        }
    )
    await db.session_snapshots.insert_one(
        {
            "id": "snap-2",
            "session_id": "sess-2",
            "warehouse": "Showroom",
            "snapshot_hash": "stale-hash",
            "items": [],
            "item_count": 0,
            "config_version_id": "LEGACY_NO_VERSION",
            "created_at": started_at,
        }
    )

    stats = await backfill_empty_session_snapshots(db, dry_run=True)

    assert stats["scanned"] == 1
    assert stats["repairable"] == 1
    assert stats["repaired"] == 0
    assert stats["updated_sessions"] == 0

    snapshot_doc = await db.session_snapshots.find_one({"session_id": "sess-2"})
    assert snapshot_doc["item_count"] == 0
    assert snapshot_doc["snapshot_hash"] == "stale-hash"

    session_doc = await db.sessions.find_one({"id": "sess-2"})
    assert session_doc["snapshot_hash"] == "stale-hash"
