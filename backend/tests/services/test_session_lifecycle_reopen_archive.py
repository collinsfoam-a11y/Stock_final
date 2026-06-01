from datetime import datetime, timezone

import pytest

from backend.services.session_lifecycle_service import SessionLifecycleService
from backend.tests.utils.in_memory_db import InMemoryDatabase


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _seed_finalized_session(db: InMemoryDatabase, session_id: str) -> None:
    now = _utc_now()
    await db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "warehouse": "WH-1",
            "staff_user": "staff1",
            "staff_name": "Staff One",
            "status": "FINALIZED",
            "finalized_at": now,
            "finalized_by": "supervisor1",
            "version": 0,
            "started_at": now,
            "last_heartbeat": now,
        }
    )
    await db.verification_sessions.insert_one(
        {
            "session_id": session_id,
            "user_id": "staff1",
            "status": "FINALIZED",
            "started_at": now,
            "last_heartbeat": now,
        }
    )


async def _seed_active_session(db: InMemoryDatabase, session_id: str) -> None:
    now = _utc_now()
    await db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "warehouse": "WH-1",
            "staff_user": "staff1",
            "staff_name": "Staff One",
            "status": "ACTIVE",
            "workflow_status": "ACTIVE",
            "version": 0,
            "started_at": now,
            "last_heartbeat": now,
        }
    )


@pytest.mark.asyncio
async def test_archive_session_requires_finalized_and_sets_archive_fields():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-archive")
    service = SessionLifecycleService(db)

    updated = await service.archive_session(
        session_id="sess-archive",
        actor="supervisor1",
        reason_code="RETENTION_POLICY",
        reason="Archived after external audit export",
    )
    assert updated["status"] == "ARCHIVED"
    assert updated.get("workflow_status") == "ARCHIVED"
    assert updated["archived"] is True
    assert updated["archived_by"] == "supervisor1"
    assert updated.get("archived_at") is not None


@pytest.mark.asyncio
async def test_reopen_session_clears_finalization_and_preserves_history():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-reopen")
    service = SessionLifecycleService(db)

    updated = await service.reopen_session(
        session_id="sess-reopen",
        actor="supervisor1",
        reason_code="DATA_CORRECTION",
        reason="Late movement adjustment required",
    )
    assert updated["status"] == "REVIEW"
    assert updated.get("workflow_status") == "REVIEW"
    assert updated.get("finalized_at") in (None, "")
    assert updated.get("finalized_by") in (None, "")
    assert updated.get("last_finalized_at") is not None
    assert updated.get("last_finalized_by") == "supervisor1"
    assert updated.get("reopened_at") is not None
    assert updated.get("reopened_by") == "supervisor1"
    assert updated.get("reopen_reason_code") == "DATA_CORRECTION"


@pytest.mark.asyncio
async def test_update_session_assignments_sets_supervisor_and_assigned_users():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-assign")
    service = SessionLifecycleService(db)

    updated = await service.update_session_assignments(
        session_id="sess-assign",
        actor="supervisor1",
        supervisor_username="supervisor1",
        assigned_users=["staff1", "staff2"],
        reason_code="STAFFING",
        reason="Reassigned due to workload",
    )
    assert updated.get("supervisor_username") == "supervisor1"
    assert updated.get("assigned_users") == ["staff1", "staff2"]


@pytest.mark.asyncio
async def test_force_close_allows_blocking_lines_with_reason():
    db = InMemoryDatabase()
    now = _utc_now()
    await db.sessions.insert_one(
        {
            "id": "sess-force",
            "session_id": "sess-force",
            "warehouse": "WH-1",
            "staff_user": "staff1",
            "staff_name": "Staff One",
            "status": "REVIEW",
            "workflow_status": "REVIEW",
            "version": 0,
            "started_at": now,
            "last_heartbeat": now,
        }
    )
    await db.verification_sessions.insert_one(
        {
            "session_id": "sess-force",
            "user_id": "staff1",
            "status": "REVIEW",
            "started_at": now,
            "last_heartbeat": now,
        }
    )
    await db.count_lines.insert_one(
        {
            "id": "line-block",
            "session_id": "sess-force",
            "approval_status": "NEEDS_REVIEW",
            "status": "pending",
            "counted_qty": 1,
            "variance": 0.0,
        }
    )
    service = SessionLifecycleService(db)

    result = await service.force_close_session(
        session_id="sess-force",
        actor="supervisor1",
        reason_code="TIMEBOX",
        reason="Warehouse shutdown window",
        note="Force close during shutdown",
    )
    assert result["session"]["status"] == "FINALIZED"
    assert result["session"].get("finalization_status") == "FORCE_CLOSED"
