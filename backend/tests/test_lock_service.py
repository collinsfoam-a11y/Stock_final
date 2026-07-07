from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from pymongo.errors import DuplicateKeyError

from backend.services.lock_service import LockService, ResourceLockedError


def _make_service():
    db = MagicMock()
    collection = MagicMock()
    db.locks = collection
    service = LockService(db)
    return service, collection


def _future(seconds=30):
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=seconds)


def _past(seconds=30):
    return datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=seconds)


async def test_acquire_lock_succeeds_when_free():
    service, collection = _make_service()
    collection.insert_one = AsyncMock(return_value=None)

    assert await service.acquire_lock("res-1", "owner-a") is True
    collection.insert_one.assert_awaited_once()


async def test_acquire_lock_raises_when_actively_held_by_another_owner():
    service, collection = _make_service()
    collection.insert_one = AsyncMock(side_effect=DuplicateKeyError("dup"))
    collection.find_one = AsyncMock(
        return_value={"_id": "res-1", "owner": "owner-b", "expires_at": _future()}
    )

    with pytest.raises(ResourceLockedError):
        await service.acquire_lock("res-1", "owner-a")


async def test_acquire_lock_is_reentrant_for_same_owner():
    service, collection = _make_service()
    collection.insert_one = AsyncMock(side_effect=DuplicateKeyError("dup"))
    collection.find_one = AsyncMock(
        return_value={"_id": "res-1", "owner": "owner-a", "expires_at": _future()}
    )

    assert await service.acquire_lock("res-1", "owner-a") is True


async def test_acquire_lock_succeeds_after_clearing_a_stale_lock():
    service, collection = _make_service()
    stale_lock = {"_id": "res-1", "owner": "owner-b", "expires_at": _past()}
    # First insert hits the stale lock; retry insert after deleting it succeeds.
    collection.insert_one = AsyncMock(side_effect=[DuplicateKeyError("dup"), None])
    collection.find_one = AsyncMock(return_value=stale_lock)
    collection.delete_one = AsyncMock()

    result = await service.acquire_lock("res-1", "owner-a")

    assert result is True
    collection.delete_one.assert_awaited_once_with(
        {"_id": "res-1", "expires_at": stale_lock["expires_at"]}
    )
    assert collection.insert_one.await_count == 2


async def test_acquire_lock_raises_if_another_owner_races_in_after_stale_clear():
    service, collection = _make_service()
    stale_lock = {"_id": "res-1", "owner": "owner-b", "expires_at": _past()}
    winning_lock = {"_id": "res-1", "owner": "owner-c", "expires_at": _future()}
    collection.insert_one = AsyncMock(
        side_effect=[DuplicateKeyError("dup"), DuplicateKeyError("dup-again")]
    )
    collection.find_one = AsyncMock(side_effect=[stale_lock, winning_lock])
    collection.delete_one = AsyncMock()

    with pytest.raises(ResourceLockedError):
        await service.acquire_lock("res-1", "owner-a")
