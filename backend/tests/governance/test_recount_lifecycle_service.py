from datetime import datetime, timezone

import pytest
from backend.services.governance_guard import GovernanceViolation
from backend.services.session_lifecycle_service import SessionLifecycleService
from backend.tests.utils.in_memory_db import InMemoryDatabase


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _seed_session(db: InMemoryDatabase, session_id: str, *, finalized: bool = False) -> None:
    now = _utc_now()
    doc: dict[str, object] = {
        "id": session_id,
        "session_id": session_id,
        "status": "FINALIZED" if finalized else "ACTIVE",
        "version": 0,
        "location_id": "LOC-1",
        "floor_id": "FLOOR-1",
        "rack_id": "RACK-1",
        "started_at": now,
        "last_heartbeat": now,
    }
    if finalized:
        doc["finalized_at"] = now
        doc["finalized_by"] = "supervisor"
    await db.sessions.insert_one(doc)


@pytest.mark.asyncio
async def test_recount_create_and_transition_flow():
    db = InMemoryDatabase()
    await _seed_session(db, "sess-recount")
    service = SessionLifecycleService(db)

    created = await service.create_recount_request(
        recount_doc={
            "session_id": "sess-recount",
            "count_line_id": "line-1",
            "reason": "variance mismatch",
            "created_by": "supervisor1",
        },
        actor="supervisor1",
    )

    assert created["status"] == "pending"
    assert created.get("_id") is not None

    transitioned = await service.transition_recount_request(
        recount_id=str(created["_id"]),
        target_status="assigned",
        actor="supervisor1",
        fields={"assigned_to": "staff1"},
    )

    assert transitioned["status"] == "assigned"
    assert transitioned["assigned_to"] == "staff1"


@pytest.mark.asyncio
async def test_session_create_uses_non_transaction_fallback_without_recursing():
    db = InMemoryDatabase()
    db.client = None
    service = SessionLifecycleService(db)
    now = _utc_now()

    created = await service.create_session(
        session_doc={
            "id": "sess-create",
            "session_id": "sess-create",
            "warehouse": "Showroom - First Floor - F4",
            "staff_user": "staff1",
            "staff_name": "Staff One",
            "type": "STANDARD",
            "status": "OPEN",
            "started_at": now,
            "last_heartbeat": now,
        },
        username="staff1",
    )

    assert created["id"] == "sess-create"
    assert created["status"] == "CREATED"
    persisted = await service.get_session("sess-create")
    assert persisted is not None
    assert persisted["session_id"] == "sess-create"


@pytest.mark.asyncio
async def test_recount_transition_rejects_terminal_state_mutation():
    db = InMemoryDatabase()
    await _seed_session(db, "sess-recount-terminal")
    service = SessionLifecycleService(db)

    created = await service.create_recount_request(
        recount_doc={
            "session_id": "sess-recount-terminal",
            "count_line_id": "line-2",
            "reason": "variance mismatch",
            "created_by": "supervisor1",
        },
        actor="supervisor1",
    )

    await service.transition_recount_request(
        recount_id=str(created["_id"]),
        target_status="completed",
        actor="supervisor1",
    )

    with pytest.raises(GovernanceViolation, match="Invalid recount transition"):
        await service.transition_recount_request(
            recount_id=str(created["_id"]),
            target_status="assigned",
            actor="supervisor1",
            fields={"assigned_to": "staff1"},
        )


@pytest.mark.asyncio
async def test_recount_create_rejects_finalized_session():
    db = InMemoryDatabase()
    await _seed_session(db, "sess-finalized", finalized=True)
    service = SessionLifecycleService(db)

    with pytest.raises(GovernanceViolation, match="Session is finalized"):
        await service.create_recount_request(
            recount_doc={
                "session_id": "sess-finalized",
                "count_line_id": "line-3",
                "reason": "variance mismatch",
                "created_by": "supervisor1",
            },
            actor="supervisor1",
        )
