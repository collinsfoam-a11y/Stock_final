from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.services.count_line_write_service import CountLineWriteService
from backend.services.governance_guard import GovernanceViolation


@pytest.mark.asyncio
async def test_void_count_line_supersedes_instead_of_deleting():
    service = object.__new__(CountLineWriteService)
    service.process_write = AsyncMock(return_value=SimpleNamespace(modified_count=1))
    line = {"_id": "mongo-id", "id": "line-1", "session_id": "session-1", "status": "pending"}

    result = await service.void_count_line(
        count_line=line,
        actor="supervisor-1",
        reason="Duplicate physical entry",
    )

    assert result.modified_count == 1
    payload = service.process_write.await_args.args[0]
    assert payload["operation"] == "update_one"
    assert payload["update"]["$set"]["status"] == "SUPERSEDED"
    assert payload["update"]["$set"]["disposition"] == "VOIDED"
    assert payload["update"]["$set"]["voided_by"] == "supervisor-1"
    assert payload["update"]["$set"]["void_reason"] == "Duplicate physical entry"


@pytest.mark.asyncio
async def test_void_count_line_requires_reason():
    service = object.__new__(CountLineWriteService)
    service.process_write = AsyncMock()
    with pytest.raises(GovernanceViolation, match="reason is required"):
        await service.void_count_line(
            count_line={"id": "line-1", "session_id": "session-1", "status": "pending"},
            actor="supervisor-1",
            reason="  ",
        )
    service.process_write.assert_not_awaited()


@pytest.mark.asyncio
async def test_void_count_line_rejects_already_superseded_line():
    service = object.__new__(CountLineWriteService)
    service.process_write = AsyncMock()
    with pytest.raises(GovernanceViolation, match="already voided or superseded"):
        await service.void_count_line(
            count_line={"id": "line-1", "session_id": "session-1", "status": "SUPERSEDED"},
            actor="supervisor-1",
            reason="Duplicate",
        )
    service.process_write.assert_not_awaited()
