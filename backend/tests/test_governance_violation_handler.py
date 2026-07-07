"""
Regression test: GovernanceViolation raised by a route that doesn't catch it
locally (e.g. create_count_line on a duplicate/retried submission) used to
propagate as an unhandled exception -- a bare 500 "Internal Server Error"
with no JSON body, instead of an actionable client-facing error.
"""

from unittest.mock import MagicMock

from backend.app_factory import _governance_violation_handler
from backend.services.governance_guard import GovernanceViolation


async def test_governance_violation_handler_returns_409_with_detail():
    request = MagicMock()
    request.method = "POST"
    request.url.path = "/api/count-lines"
    exc = GovernanceViolation("CRITICAL: Duplicate semantic hash for logical count write")

    response = await _governance_violation_handler(request, exc)

    assert response.status_code == 409
    assert b"Duplicate semantic hash" in response.body
