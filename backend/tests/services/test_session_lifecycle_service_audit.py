"""
Canonical audit coverage for session lifecycle events (BSR remediation).

transition_session/create_session already write to governance_events via
GovernanceAuditService (event="SESSION_WRITE" + operation=...); these tests
verify the newer, richer AuditService.log_event calls added alongside it
(bridge pattern -- the older system is untouched).
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from backend.models.audit import AuditEventType
from backend.services.session_lifecycle_service import SessionLifecycleService


def _service_with_mocks():
    db = MagicMock()
    service = SessionLifecycleService(db)
    service.audit_service.log_write_event = AsyncMock()
    service.validation_service.validate_session = AsyncMock()
    service._sync_session_projection = AsyncMock()
    return service, db


@pytest.mark.asyncio
async def test_create_session_writes_canonical_audit_event():
    service, db = _service_with_mocks()
    db.sessions.insert_one = AsyncMock()
    db.verification_sessions.insert_one = AsyncMock()

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with patch("backend.services.audit_service.AuditService", return_value=audit_service):
        await service.create_session(
            session_doc={"id": "sess-1", "location_id": "LOC1", "floor_id": "F1"},
            username="staff1",
            db_session=MagicMock(),
            _transaction_started=True,
        )

    audit_service.log_event.assert_awaited_once()
    kwargs = audit_service.log_event.await_args.kwargs
    assert kwargs["event_type"] == AuditEventType.SESSION_CREATED
    assert kwargs["entity_type"] == "session"
    assert kwargs["entity_id"] == "sess-1"
    assert kwargs["actor_username"] == "staff1"


@pytest.mark.parametrize(
    "target,expected_event",
    [
        ("ACTIVE", AuditEventType.SESSION_ACTIVATED),
        ("REVIEW", AuditEventType.SESSION_REVIEW_STARTED),
        ("FINALIZED", AuditEventType.SESSION_FINALIZED),
    ],
)
@pytest.mark.asyncio
async def test_transition_session_writes_canonical_audit_event(target, expected_event):
    service, db = _service_with_mocks()
    session = {"id": "sess-1", "status": "CREATED", "version": 1}
    service.ensure_session_exists = AsyncMock(return_value=session)
    service._update_session_with_occ = AsyncMock()
    service._assert_session_ready_to_finalize = AsyncMock()
    db.verification_sessions.update_one = AsyncMock()

    # Seed the "current" status so assert_valid_transition allows the target.
    current_by_target = {"ACTIVE": "CREATED", "REVIEW": "ACTIVE", "FINALIZED": "REVIEW"}
    session["status"] = current_by_target[target]

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with patch("backend.services.audit_service.AuditService", return_value=audit_service):
        await service.transition_session(
            session_id="sess-1",
            target_status=target,
            actor="supervisor1",
            db_session=MagicMock(),
            expected_version=1,
            _transaction_started=True,
        )

    audit_service.log_event.assert_awaited_once()
    kwargs = audit_service.log_event.await_args.kwargs
    assert kwargs["event_type"] == expected_event
    assert kwargs["entity_type"] == "session"
    assert kwargs["entity_id"] == "sess-1"
    assert kwargs["actor_username"] == "supervisor1"
    assert kwargs["decision"] == target
