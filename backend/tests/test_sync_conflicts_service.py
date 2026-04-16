from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.services.sync_conflicts_service import ConflictResolution, SyncConflictsService


@pytest.mark.asyncio
async def test_resolve_conflict_handles_non_object_id_entity_ids():
    db = MagicMock()
    db.sync_conflicts.update_one = AsyncMock(return_value=None)
    db.count_lines.find_one = AsyncMock(return_value=None)
    db.count_lines.update_one = AsyncMock(return_value=None)

    service = SyncConflictsService(db)
    service.get_conflict_by_id = AsyncMock(
        return_value={
            "id": "507f1f77bcf86cd799439011",
            "status": "pending",
            "entity_type": "count_line",
            "entity_id": "offline-line-1",
            "server_data": {"field": "server"},
            "local_data": {"field": "local"},
        }
    )

    result = await service.resolve_conflict(
        "507f1f77bcf86cd799439011",
        ConflictResolution.ACCEPT_SERVER,
        "supervisor1",
    )

    assert result["resolution"] == ConflictResolution.ACCEPT_SERVER.value
    assert db.count_lines.find_one.await_args.args[0] == {"id": "offline-line-1"}
    assert db.count_lines.update_one.await_args.args[0] == {"id": "offline-line-1"}
