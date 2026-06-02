from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from backend.api import rack_api


@pytest.mark.asyncio
async def test_release_rack_fails_closed_when_redis_lock_owned_by_someone_else(monkeypatch):
    mock_db = MagicMock()
    mock_db.rack_registry.find_one = AsyncMock(
        return_value={"rack_id": "R1", "claimed_by": "u1", "session_id": None}
    )

    mock_lock_manager = MagicMock()
    mock_lock_manager.release_rack_lock = AsyncMock(return_value=False)
    mock_lock_manager.get_rack_lock_owner = AsyncMock(return_value="u2")

    mock_pubsub = MagicMock()
    mock_pubsub.publish_rack_update = AsyncMock(return_value=None)

    monkeypatch.setattr(rack_api, "get_db", lambda: mock_db)
    monkeypatch.setattr(rack_api, "get_lock_manager", lambda _: mock_lock_manager)
    monkeypatch.setattr(rack_api, "update_rack_status", AsyncMock())

    with pytest.raises(HTTPException) as exc:
        await rack_api.release_rack(
            rack_id="R1",
            current_user={"username": "u1"},
            redis_service=MagicMock(),
            pubsub_service=mock_pubsub,
        )

    assert exc.value.status_code == 409
    assert "locked by u2" in str(exc.value.detail)
    rack_api.update_rack_status.assert_not_called()


@pytest.mark.asyncio
async def test_release_rack_allows_release_when_lock_already_expired(monkeypatch):
    mock_db = MagicMock()
    mock_db.rack_registry.find_one = AsyncMock(
        return_value={"rack_id": "R1", "claimed_by": "u1", "session_id": None}
    )

    mock_lock_manager = MagicMock()
    mock_lock_manager.release_rack_lock = AsyncMock(return_value=False)
    mock_lock_manager.get_rack_lock_owner = AsyncMock(return_value=None)

    mock_pubsub = MagicMock()
    mock_pubsub.publish_rack_update = AsyncMock(return_value=None)

    monkeypatch.setattr(rack_api, "get_db", lambda: mock_db)
    monkeypatch.setattr(rack_api, "get_lock_manager", lambda _: mock_lock_manager)
    monkeypatch.setattr(rack_api, "update_rack_status", AsyncMock())

    result = await rack_api.release_rack(
        rack_id="R1",
        current_user={"username": "u1"},
        redis_service=MagicMock(),
        pubsub_service=mock_pubsub,
    )

    assert result.success is True
    rack_api.update_rack_status.assert_called_once()


@pytest.mark.asyncio
async def test_pause_rack_fails_when_lock_expired(monkeypatch):
    mock_db = MagicMock()
    mock_db.rack_registry.find_one = AsyncMock(
        return_value={
            "rack_id": "R1",
            "claimed_by": "u1",
            "session_id": None,
            "status": "active",
            "lock_expires_at": None,
        }
    )

    mock_lock_manager = MagicMock()
    mock_lock_manager.is_rack_lock_owned_by = AsyncMock(return_value=False)
    mock_lock_manager.get_rack_lock_owner = AsyncMock(return_value=None)

    mock_pubsub = MagicMock()
    mock_pubsub.publish_rack_update = AsyncMock(return_value=None)

    monkeypatch.setattr(rack_api, "get_db", lambda: mock_db)
    monkeypatch.setattr(rack_api, "get_lock_manager", lambda _: mock_lock_manager)
    monkeypatch.setattr(rack_api, "update_rack_status", AsyncMock())

    with pytest.raises(HTTPException) as exc:
        await rack_api.pause_rack(
            rack_id="R1",
            current_user={"username": "u1"},
            redis_service=MagicMock(),
            pubsub_service=mock_pubsub,
        )

    assert exc.value.status_code == 409
    assert "lock expired" in str(exc.value.detail)
    rack_api.update_rack_status.assert_not_called()


@pytest.mark.asyncio
async def test_resume_rack_fails_when_lock_owned_by_someone_else(monkeypatch):
    mock_db = MagicMock()
    mock_db.rack_registry.find_one = AsyncMock(
        return_value={
            "rack_id": "R1",
            "claimed_by": "u1",
            "session_id": None,
            "status": "paused",
            "lock_expires_at": None,
        }
    )

    mock_lock_manager = MagicMock()
    mock_lock_manager.is_rack_lock_owned_by = AsyncMock(return_value=False)
    mock_lock_manager.get_rack_lock_owner = AsyncMock(return_value="u2")

    mock_pubsub = MagicMock()
    mock_pubsub.publish_rack_update = AsyncMock(return_value=None)

    monkeypatch.setattr(rack_api, "get_db", lambda: mock_db)
    monkeypatch.setattr(rack_api, "get_lock_manager", lambda _: mock_lock_manager)
    monkeypatch.setattr(rack_api, "update_rack_status", AsyncMock())

    with pytest.raises(HTTPException) as exc:
        await rack_api.resume_rack(
            rack_id="R1",
            current_user={"username": "u1"},
            redis_service=MagicMock(),
            pubsub_service=mock_pubsub,
        )

    assert exc.value.status_code == 409
    assert "locked by u2" in str(exc.value.detail)
    rack_api.update_rack_status.assert_not_called()
