from __future__ import annotations

from datetime import datetime, timezone

import pytest

from backend.services.projection_rebuild_service import rebuild_projection
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_rebuild_projection_recomputes_and_upserts_session_row():
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    session_id = "sess-rebuild-1"

    await db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "status": "REVIEW",
            "warehouse": "Main",
            "staff_user": "staff1",
            "updated_at": now,
            "started_at": now,
        }
    )
    await db.count_lines.insert_many(
        [
            {
                "id": "line-1",
                "session_id": session_id,
                "item_code": "ITEM-1",
                "counted_qty": 10,
                "variance": 2,
                "status": "locked",
                "approval_status": "APPROVED",
                "counted_at": now,
                "updated_at": now,
            },
            {
                "id": "line-2",
                "session_id": session_id,
                "item_code": "ITEM-2",
                "counted_qty": 3,
                "variance": -1,
                "status": "pending",
                "approval_status": "PENDING",
                "counted_at": now,
                "updated_at": now,
            },
        ]
    )
    await db["session_dashboard_projection"].insert_one(
        {
            "session_id": session_id,
            "total_items": 999,
            "verified_items": 999,
            "pending_items": 0,
            "status": "BROKEN",
        }
    )
    await db["event_log"].insert_one(
        {
            "session_id": session_id,
            "event_type": "COUNT_LINE_CREATED",
            "timestamp": now,
        }
    )

    rebuilt = await rebuild_projection(db, session_id)
    stored = await db["session_dashboard_projection"].find_one({"session_id": session_id})

    assert rebuilt["session_id"] == session_id
    assert rebuilt["total_items"] == 2
    assert rebuilt["verified_items"] == 1
    assert rebuilt["pending_items"] == 1
    assert rebuilt["total_variance"] == 1.0
    assert isinstance(rebuilt.get("source_updated_at"), datetime)
    assert stored is not None
    assert stored["total_items"] == 2
    assert stored["verified_items"] == 1


@pytest.mark.asyncio
async def test_rebuild_projection_requires_existing_session():
    db = InMemoryDatabase()

    with pytest.raises(ValueError, match="Session not found"):
        await rebuild_projection(db, "missing-session")
