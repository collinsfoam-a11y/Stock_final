from unittest.mock import AsyncMock

import pytest
from backend.api.unknown_items_api import delete_unknown_item


@pytest.mark.asyncio
async def test_delete_unknown_item_uses_governed_service(monkeypatch):
    mock_db = AsyncMock()
    current_user = {"username": "admin1", "role": "admin"}

    service = AsyncMock()
    service.dismiss_unknown_item = AsyncMock(
        return_value={"id": "unknown-1", "status": "DISMISSED"}
    )
    monkeypatch.setattr("backend.api.unknown_items_api.UnknownItemService", lambda db: service)

    response = await delete_unknown_item("unknown-1", db=mock_db, current_user=current_user)

    assert response == {
        "success": True,
        "message": "Unknown item report dismissed",
        "data": {"id": "unknown-1", "status": "DISMISSED"},
    }
    service.dismiss_unknown_item.assert_awaited_once_with(
        item_id="unknown-1",
        actor_id="admin1",
    )
