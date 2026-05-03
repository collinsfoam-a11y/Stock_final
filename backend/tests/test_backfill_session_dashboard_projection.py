from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from backend.scripts.backfill_session_dashboard_projection import (
    SESSION_PROJECTION_COLLECTION,
    backfill_session_dashboard_projection,
    build_session_dashboard_projection_row,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def test_build_session_dashboard_projection_row_uses_source_summary_without_events():
    now = _utc_now_naive()
    session = {
        "id": "sess-missing",
        "staff_user": "staff-1",
        "staff_name": "Staff One",
        "warehouse": "WH1",
        "location_name": "Floor 1",
        "rack_no": "Rack 2",
        "status": "ACTIVE",
        "started_at": now - timedelta(minutes=10),
        "total_variance": 0.0,
    }
    lines = [
        {
            "session_id": "sess-missing",
            "variance": 2.0,
            "damaged_qty": 1,
            "status": "approved",
            "approval_status": "APPROVED",
            "updated_at": now - timedelta(minutes=1),
        },
        {
            "session_id": "sess-missing",
            "variance": -1.0,
            "damaged_qty": 0,
            "status": "pending",
            "approval_status": "NEEDS_REVIEW",
            "updated_at": now - timedelta(minutes=2),
        },
        {
            "session_id": "sess-missing",
            "variance": 100.0,
            "status": "superseded",
            "updated_at": now,
        },
    ]

    row = build_session_dashboard_projection_row(
        session,
        lines,
        latest_event=None,
        now=now,
    )

    assert row["session_id"] == "sess-missing"
    assert row["total_items"] == 2
    assert row["verified_items"] == 1
    assert row["pending_items"] == 1
    assert row["damage_items"] == 1
    assert row["total_variance"] == 1.0
    assert row["positive_variance"] == 2.0
    assert row["negative_variance"] == -1.0
    assert row["pending_approvals"] == 1
    assert row["last_event_id"] is None
    assert row["last_event_type"] is None
    assert row["backfill_source"] == "sessions+count_lines+event_log"


def test_build_session_dashboard_projection_row_falls_back_to_session_summary():
    now = _utc_now_naive()
    session = {
        "session_id": "sess-empty",
        "staff_user": "staff-2",
        "warehouse": "WH2",
        "status": "ACTIVE",
        "started_at": now - timedelta(minutes=5),
        "total_items": 3,
        "verified_items": 2,
        "damage_items": 1,
        "total_variance": -4.0,
    }

    row = build_session_dashboard_projection_row(
        session,
        [],
        latest_event=None,
        now=now,
    )

    assert row["session_id"] == "sess-empty"
    assert row["total_items"] == 3
    assert row["verified_items"] == 2
    assert row["pending_items"] == 1
    assert row["damage_items"] == 1
    assert row["total_variance"] == -4.0


@pytest.mark.asyncio
async def test_backfill_session_dashboard_projection_dry_run_does_not_insert():
    db = InMemoryDatabase()
    now = _utc_now_naive()
    await db.sessions.insert_one(
        {
            "id": "sess-1",
            "staff_user": "staff-1",
            "warehouse": "WH1",
            "status": "ACTIVE",
            "started_at": now,
        }
    )

    result = await backfill_session_dashboard_projection(db, dry_run=True)

    assert result["mode"] == "dry-run"
    assert result["sessions_scanned"] == 1
    assert result["missing_sessions"] == 1
    assert result["repairable_sessions"] == 1
    assert result["inserted_sessions"] == 0
    assert result["missing_session_ids"] == ["sess-1"]
    assert result["coverage_before"] == {"total_sessions": 1, "covered_sessions": 0}
    assert result["coverage_after"] == {"total_sessions": 1, "covered_sessions": 1}
    assert await db[SESSION_PROJECTION_COLLECTION].count_documents({}) == 0


@pytest.mark.asyncio
async def test_backfill_session_dashboard_projection_execute_inserts_missing_row():
    db = InMemoryDatabase()
    now = _utc_now_naive()
    await db.sessions.insert_one(
        {
            "id": "sess-2",
            "staff_user": "staff-2",
            "warehouse": "WH2",
            "status": "ACTIVE",
            "started_at": now,
        }
    )
    await db.count_lines.insert_one(
        {
            "session_id": "sess-2",
            "variance": 0.0,
            "status": "locked",
            "approval_status": "APPROVED",
            "updated_at": now,
        }
    )

    result = await backfill_session_dashboard_projection(db, dry_run=False)
    row = await db[SESSION_PROJECTION_COLLECTION].find_one({"session_id": "sess-2"})

    assert result["mode"] == "execute"
    assert result["inserted_sessions"] == 1
    assert result["coverage_after"] == {"total_sessions": 1, "covered_sessions": 1}
    assert row is not None
    assert row["total_items"] == 1
    assert row["verified_items"] == 1
