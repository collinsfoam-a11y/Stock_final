from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.services.session_lifecycle_service import SessionLifecycleService


class _StandaloneAdmin:
    async def command(self, name: str):
        assert name == "hello"
        return {"ok": 1}


class _StandaloneClient:
    admin = _StandaloneAdmin()

    def start_session(self):
        raise AssertionError("standalone topology should not start a Mongo session")


def _service_with_standalone_db() -> tuple[SessionLifecycleService, MagicMock]:
    db = MagicMock()
    db.client = _StandaloneClient()
    db.sessions = MagicMock()
    db.sessions.count_documents = AsyncMock(return_value=0)
    db.verification_sessions = MagicMock()

    service = SessionLifecycleService(
        db,
        validation_service=SimpleNamespace(validate_session=AsyncMock()),
        audit_service=SimpleNamespace(log_write_event=AsyncMock()),
        projection_service=SimpleNamespace(sync_for_sessions=AsyncMock()),
    )
    return service, db


@pytest.mark.asyncio
async def test_create_session_uses_local_path_when_transactions_are_unavailable():
    service, db = _service_with_standalone_db()
    db.sessions.insert_one = AsyncMock(return_value=SimpleNamespace(inserted_id="sess-local"))
    db.verification_sessions.insert_one = AsyncMock(
        return_value=SimpleNamespace(inserted_id="verify-local")
    )

    created = await service.create_session(
        session_doc={"id": "sess-local", "warehouse": "WH001"},
        username="staff1",
    )

    assert created["id"] == "sess-local"
    db.sessions.insert_one.assert_awaited_once()
    db.verification_sessions.insert_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_transition_session_uses_local_path_when_transactions_are_unavailable():
    service, db = _service_with_standalone_db()
    db.sessions.find_one = AsyncMock(
        side_effect=[
            {"id": "sess-local", "session_id": "sess-local", "status": "CREATED", "version": 0},
            {"id": "sess-local", "session_id": "sess-local", "status": "ACTIVE", "version": 1},
        ]
    )
    db.sessions.update_one = AsyncMock(return_value=SimpleNamespace(modified_count=1))
    db.verification_sessions.update_one = AsyncMock(
        return_value=SimpleNamespace(modified_count=1)
    )

    transitioned = await service.transition_session(
        session_id="sess-local",
        target_status="ACTIVE",
        actor="staff1",
    )

    assert transitioned["status"] == "ACTIVE"
    db.sessions.update_one.assert_awaited_once()
    db.verification_sessions.update_one.assert_awaited_once()
