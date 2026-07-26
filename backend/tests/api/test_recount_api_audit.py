"""
Canonical audit coverage for recount request creation (BSR remediation,
COUNT_LINE_RECOUNT_REQUESTED). complete_recount_request's
COUNT_LINE_RECOUNT_SUBMITTED event is covered by ruff + full-suite
regression checks; a dedicated unit test was not added given the depth of
mocking required for its multi-service transaction (see BSR remediation
report for the explicit gap note).
"""

from unittest.mock import AsyncMock, patch

import pytest

from backend.api.recount_api import RecountCreateRequest, create_recount_request
from backend.models.audit import AuditEventType
from backend.services.governance_guard import install_db_write_guards
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_create_recount_request_writes_canonical_audit_event():
    db = InMemoryDatabase()
    await db.sessions.insert_one(
        {
            "id": "sess-1",
            "session_id": "sess-1",
            "status": "ACTIVE",
            "version": 0,
        }
    )
    await db.count_lines.insert_one(
        {
            "id": "line-1",
            "session_id": "sess-1",
            "item_code": "ITEM001",
            "item_name": "Test Item",
            "barcode": "123456",
            "status": "rejected",
            "counted_by": "staff1",
            "created_by": "staff1",
            "recount_iteration": 0,
        }
    )
    install_db_write_guards(db)

    with patch(
        "backend.api.recount_api.NotificationService.notify_recount_assigned",
        new=AsyncMock(),
    ):
        audit_service = AsyncMock()
        audit_service.log_event = AsyncMock()
        with patch(
            "backend.services.audit_service.AuditService", return_value=audit_service
        ):
            await create_recount_request(
                request=RecountCreateRequest(
                    count_line_id="line-1",
                    reason="Variance too large",
                    assign_to="staff2",
                ),
                current_user={"username": "supervisor1", "role": "supervisor"},
                db=db,
            )

    audit_service.log_event.assert_awaited_once()
    kwargs = audit_service.log_event.await_args.kwargs
    assert kwargs["event_type"] == AuditEventType.COUNT_LINE_RECOUNT_REQUESTED
    assert kwargs["entity_type"] == "count_line"
    assert kwargs["entity_id"] == "line-1"
    assert kwargs["actor_username"] == "supervisor1"
    assert kwargs["session_id"] == "sess-1"
    assert kwargs["reason"] == "Variance too large"
