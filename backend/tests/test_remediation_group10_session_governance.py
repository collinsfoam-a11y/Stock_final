"""
FIX GROUP 10 — Regression tests: Session governance pre-finalization gate.

Validates server-side enforcement that sessions cannot be finalized with:
  - Unresolved unknown items
  - Pending recount requests
  - Pending approvals
"""

from unittest.mock import AsyncMock, MagicMock
import pytest

from backend.services.governance_guard import GovernanceViolation
from backend.services.session_lifecycle_service import SessionLifecycleService


def _make_db(
    unknown_count: int = 0,
    recount_count: int = 0,
    pending_lines_count: int = 0,
) -> MagicMock:
    db = MagicMock()
    db.unknown_items = MagicMock()
    db.unknown_items.count_documents = AsyncMock(return_value=unknown_count)
    db.recount_requests = MagicMock()
    db.recount_requests.count_documents = AsyncMock(return_value=recount_count)
    db.count_lines = MagicMock()
    db.count_lines.count_documents = AsyncMock(return_value=pending_lines_count)
    return db


@pytest.mark.asyncio
async def test_finalization_blocked_by_unresolved_unknown_items():
    db = _make_db(unknown_count=3)
    service = SessionLifecycleService(db)

    with pytest.raises(GovernanceViolation, match="unresolved unknown item"):
        await service._assert_session_ready_to_finalize("sess-1")


@pytest.mark.asyncio
async def test_finalization_blocked_by_pending_recounts():
    db = _make_db(recount_count=2)
    service = SessionLifecycleService(db)

    with pytest.raises(GovernanceViolation, match="pending recount request"):
        await service._assert_session_ready_to_finalize("sess-1")


@pytest.mark.asyncio
async def test_finalization_blocked_by_pending_approvals():
    db = _make_db(pending_lines_count=5)
    service = SessionLifecycleService(db)

    with pytest.raises(GovernanceViolation, match="pending approval"):
        await service._assert_session_ready_to_finalize("sess-1")


@pytest.mark.asyncio
async def test_finalization_allowed_when_all_resolved():
    db = _make_db(unknown_count=0, recount_count=0, pending_lines_count=0)
    service = SessionLifecycleService(db)

    # Must not raise
    await service._assert_session_ready_to_finalize("sess-1")


@pytest.mark.asyncio
async def test_finalization_blocked_by_multiple_blockers():
    db = _make_db(unknown_count=1, recount_count=1, pending_lines_count=2)
    service = SessionLifecycleService(db)

    with pytest.raises(GovernanceViolation) as exc_info:
        await service._assert_session_ready_to_finalize("sess-1")

    message = str(exc_info.value)
    assert "unresolved unknown item" in message
    assert "pending recount request" in message
    assert "pending approval" in message


@pytest.mark.asyncio
async def test_finalize_transition_calls_readiness_check():
    """Calling transition_session to FINALIZED must invoke the readiness check."""
    db = _make_db(unknown_count=1)
    db.sessions = MagicMock()
    db.sessions.find_one = AsyncMock(
        return_value={
            "id": "sess-1",
            "session_id": "sess-1",
            "status": "REVIEW",
            "version": 1,
        }
    )
    db.sessions.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    db.verification_sessions = MagicMock()
    db.verification_sessions.update_one = AsyncMock(return_value=None)
    db.governance_events = MagicMock()
    db.governance_events.insert_one = AsyncMock(return_value=None)

    service = SessionLifecycleService(db)
    service.validation_service = MagicMock()
    service.validation_service.validate_session = AsyncMock(return_value=None)
    service.audit_service = MagicMock()
    service.audit_service.log_write_event = AsyncMock(return_value=None)
    service.projection_service = MagicMock()
    service.projection_service.sync_for_sessions = AsyncMock(return_value=None)

    with pytest.raises(GovernanceViolation, match="unresolved unknown item"):
        await service.transition_session(
            session_id="sess-1",
            target_status="FINALIZED",
            actor="supervisor1",
            db_session="mock_tx",
        )
