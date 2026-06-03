"""
FIX GROUP 5 — Regression tests: Governance audit events must carry full actor attribution.

Validates that approve, reject, void, recount, finalize, and reopen all capture
real actor details (user_id, username, role, org_id, timestamp).
"""

from unittest.mock import AsyncMock, MagicMock
import pytest
from datetime import datetime

from backend.services.governance_audit_service import GovernanceAuditService


def _make_db() -> MagicMock:
    db = MagicMock()
    db.governance_events = MagicMock()
    db.governance_events.insert_one = AsyncMock(return_value=None)
    return db


@pytest.mark.asyncio
async def test_log_governance_event_captures_full_actor():
    db = _make_db()
    service = GovernanceAuditService(db)

    actor = {
        "user_id": "u-123",
        "username": "supervisor_jane",
        "role": "supervisor",
        "org_id": "ORG-1",
    }

    await service.log_governance_event(
        event="APPROVE",
        operation="approve",
        session_id="sess-1",
        actor=actor,
    )

    call_args = db.governance_events.insert_one.call_args
    payload = call_args.args[0]

    assert payload["actor_id"] == "u-123"
    assert payload["username"] == "supervisor_jane"
    assert payload["role"] == "supervisor"
    assert payload["org_id"] == "ORG-1"
    assert isinstance(payload["timestamp"], datetime)
    assert payload["event"] == "APPROVE"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "operation", ["approve", "reject", "void", "recount", "finalize", "reopen"]
)
async def test_all_governance_operations_include_actor(operation: str):
    """Every governed operation must have a real actor, not 'system'."""
    db = _make_db()
    service = GovernanceAuditService(db)

    actor = {
        "user_id": "u-456",
        "username": "admin_bob",
        "role": "admin",
        "org_id": "ORG-2",
    }

    await service.log_governance_event(
        event=operation.upper(),
        operation=operation,
        session_id="sess-2",
        actor=actor,
    )

    payload = db.governance_events.insert_one.call_args.args[0]
    assert payload["username"] not in {"", "system", None}, (
        f"Operation '{operation}' recorded with system/empty actor"
    )
    assert payload["actor_id"] not in {"", "system", None}


@pytest.mark.asyncio
async def test_legacy_log_write_event_is_backwards_compatible():
    """log_write_event (old API) must still work via the shim."""
    db = _make_db()
    service = GovernanceAuditService(db)

    await service.log_write_event(
        event="COUNT_LINE_WRITE",
        operation="COUNT",
        session_id="sess-3",
        actor_id="user_xyz",
    )

    payload = db.governance_events.insert_one.call_args.args[0]
    assert payload["actor_id"] == "user_xyz"
    assert "timestamp" in payload


@pytest.mark.asyncio
async def test_system_actor_emits_warning_for_non_automated_operations():
    """
    When a non-automated operation is performed by an actor with no real identity,
    a warning must be logged.  Only explicitly whitelisted automated actors
    (conflict_resolver, system_auto_resolve, sync) may omit real actor context.
    """
    from unittest.mock import patch

    db = _make_db()
    service = GovernanceAuditService(db)

    # Actor with no user_id, username, or id — resolves to empty actor_id,
    # which is NOT in the automated-actor whitelist, so a warning must fire.
    actor = {"role": "system"}

    with patch("backend.services.governance_audit_service.logger") as mock_logger:
        await service.log_governance_event(
            event="APPROVE",
            operation="approve",
            session_id="sess-4",
            actor=actor,
        )

    # A warning must have been emitted because the actor identity is missing.
    assert mock_logger.warning.called, (
        "Expected logger.warning() to be called when actor identity is missing "
        "for a non-automated operation"
    )
    # The first warning call must mention the governance event or missing actor.
    warning_args = mock_logger.warning.call_args_list[0].args
    assert any(
        "Governance event" in str(a) or "without real actor" in str(a) for a in warning_args
    ), f"Warning message did not mention the missing actor; got: {warning_args}"
