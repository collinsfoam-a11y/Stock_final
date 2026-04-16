from datetime import datetime, timezone

import pytest

from backend.scripts.cleanup_synthetic_session_data import cleanup_synthetic_session_data
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_cleanup_synthetic_session_data_archives_and_deletes_synthetic_records():
    db = InMemoryDatabase()
    created_at = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.session_snapshots.insert_one(
        {
            "session_id": "synthetic-1",
            "warehouse": "SMOKE-123",
            "item_count": 0,
            "created_at": created_at,
        }
    )
    await db.session_snapshots.insert_one(
        {
            "session_id": "real-1",
            "warehouse": "Showroom",
            "item_count": 0,
            "created_at": created_at,
        }
    )
    await db.session_snapshots.insert_one(
        {
            "session_id": "synthetic-2",
            "warehouse": "SMOKE-456",
            "item_count": 4,
            "created_at": created_at,
        }
    )

    await db.sessions.insert_one({"id": "synthetic-1", "session_id": "synthetic-1"})
    await db.sessions.insert_one({"id": "real-1", "session_id": "real-1"})
    await db.verification_sessions.insert_one({"session_id": "synthetic-1"})
    await db.verification_sessions.insert_one({"session_id": "real-1"})
    await db.count_lines.insert_one({"session_id": "synthetic-1", "item_code": "ITEM-1"})

    stats = await cleanup_synthetic_session_data(db, dry_run=False)

    assert stats["scanned_empty_snapshots"] == 2
    assert stats["synthetic_snapshots"] == 1
    assert stats["synthetic_session_ids"] == 1
    assert stats["archived"] == 4
    assert stats["deleted"] == 4

    assert await db.session_snapshots.count_documents({"session_id": "synthetic-1"}) == 0
    assert await db.sessions.count_documents({"id": "synthetic-1"}) == 0
    assert await db.verification_sessions.count_documents({"session_id": "synthetic-1"}) == 0
    assert await db.count_lines.count_documents({"session_id": "synthetic-1"}) == 0

    assert await db.session_snapshots.count_documents({"session_id": "real-1"}) == 1
    assert await db.sessions.count_documents({"id": "real-1"}) == 1
    assert await db.session_snapshots.count_documents({"session_id": "synthetic-2"}) == 1
    assert await db.data_archive.count_documents({}) == 4


@pytest.mark.asyncio
async def test_cleanup_synthetic_session_data_dry_run_does_not_modify_data():
    db = InMemoryDatabase()
    created_at = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.session_snapshots.insert_one(
        {
            "session_id": "synthetic-1",
            "warehouse": "stale-auth-123",
            "item_count": 0,
            "created_at": created_at,
        }
    )
    await db.sessions.insert_one({"id": "synthetic-1", "session_id": "synthetic-1"})

    stats = await cleanup_synthetic_session_data(db, dry_run=True)

    assert stats["synthetic_snapshots"] == 1
    assert stats["synthetic_session_ids"] == 1
    assert stats["archived"] == 0
    assert stats["deleted"] == 0

    assert await db.session_snapshots.count_documents({"session_id": "synthetic-1"}) == 1
    assert await db.sessions.count_documents({"id": "synthetic-1"}) == 1
    assert await db.data_archive.count_documents({}) == 0
