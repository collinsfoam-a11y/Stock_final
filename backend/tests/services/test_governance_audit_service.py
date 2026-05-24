import pytest

from backend.services.governance_audit_service import GovernanceAuditService
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_governance_audit_writes_immutable_ledger_before_legacy_view():
    db = InMemoryDatabase()
    service = GovernanceAuditService(db)

    await service.log_write_event(
        event="COUNT_LINE_APPROVED",
        operation="approve",
        session_id="sess-1",
        item_id="ITEM-1",
        version=4,
        idempotency_key="idem-1",
        actor_id="supervisor-1",
        metadata={"reason": "variance accepted"},
        device_id="device-1",
    )

    ledger = await db.governance_ledger.find_one({"session_id": "sess-1"})
    legacy = await db.governance_events.find_one({"session_id": "sess-1"})

    assert ledger is not None
    assert ledger["immutable"] is True
    assert ledger["event_type"] == "COUNT_LINE_APPROVED"
    assert ledger["aggregate_version"] == 4
    assert legacy is not None
    assert legacy["event"] == "COUNT_LINE_APPROVED"
