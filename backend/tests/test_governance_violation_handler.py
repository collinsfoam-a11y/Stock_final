"""
Regression test: GovernanceViolation raised by a route that doesn't catch it
locally (e.g. create_count_line on a duplicate/retried submission) used to
propagate as an unhandled exception -- a bare 500 "Internal Server Error"
with no JSON body, instead of an actionable client-facing error.
"""

from unittest.mock import AsyncMock, MagicMock, patch

from backend.app_factory import _governance_violation_handler
from backend.models.audit import AuditEventType
from backend.services.governance_guard import GovernanceViolation


async def test_governance_violation_handler_returns_409_with_detail():
    request = MagicMock()
    request.method = "POST"
    request.url.path = "/api/count-lines"
    exc = GovernanceViolation("CRITICAL: Duplicate semantic hash for logical count write")

    response = await _governance_violation_handler(request, exc)

    assert response.status_code == 409
    assert b"Duplicate semantic hash" in response.body


async def test_governance_violation_handler_writes_audit_event():
    request = MagicMock()
    request.method = "POST"
    request.url.path = "/api/count-lines"
    exc = GovernanceViolation("CRITICAL: Duplicate semantic hash for logical count write")

    mock_db = MagicMock()
    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with (
        patch("backend.db.runtime.get_db", return_value=mock_db),
        patch("backend.services.audit_service.AuditService", return_value=audit_service),
    ):
        await _governance_violation_handler(request, exc)

    audit_service.log_event.assert_awaited_once()
    kwargs = audit_service.log_event.await_args.kwargs
    assert kwargs["event_type"] == AuditEventType.GOVERNANCE_VIOLATION
    assert kwargs["details"]["path"] == "/api/count-lines"
    assert "Duplicate semantic hash" in kwargs["details"]["detail"]


async def test_governance_violation_handler_survives_audit_db_unavailable():
    """If get_db() isn't initialized (or audit logging fails for any other
    reason), the client must still get the 409 -- audit failure must never
    block the primary error response."""
    request = MagicMock()
    request.method = "POST"
    request.url.path = "/api/count-lines"
    exc = GovernanceViolation("CRITICAL: Duplicate semantic hash for logical count write")

    response = await _governance_violation_handler(request, exc)

    assert response.status_code == 409
