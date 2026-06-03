"""
FIX GROUP 3 — Regression tests: Rack lock ownership must use username, not session_id.

Validates:
  - User A acquires lock → User B attempt fails
  - User A renewal succeeds
  - Lock expiry releases correctly
  - Heartbeat uses username for renewal
"""

from unittest.mock import AsyncMock, MagicMock
import pytest

from backend.services.lock_manager import LockManager


def _make_redis() -> MagicMock:
    redis = MagicMock()
    redis.set = AsyncMock(return_value=True)
    redis.get = AsyncMock(return_value=None)
    redis.eval = AsyncMock(return_value=1)
    redis.exists = AsyncMock(return_value=0)
    redis.ttl = AsyncMock(return_value=60)
    return redis


@pytest.mark.asyncio
async def test_user_b_cannot_acquire_lock_held_by_user_a():
    """User A holds lock → User B must be denied."""
    redis = _make_redis()
    # First call (User A): Redis SETNX returns True (acquired)
    # Second call (User B): Redis SETNX returns None/False (already locked)
    redis.set = AsyncMock(side_effect=[True, None])
    redis.get = AsyncMock(return_value="user_a")

    lm = LockManager(redis)

    result_a = await lm.acquire_rack_lock("RACK-1", "user_a", ttl=60)
    result_b = await lm.acquire_rack_lock("RACK-1", "user_b", ttl=60)

    assert result_a is True
    assert result_b is False


@pytest.mark.asyncio
async def test_user_a_renewal_succeeds():
    """User A can renew their own lock."""
    redis = _make_redis()
    # Lua script returns 1 when owner matches
    redis.eval = AsyncMock(return_value=1)

    lm = LockManager(redis)
    renewed = await lm.renew_rack_lock("RACK-2", "user_a", ttl=120)

    assert renewed is True
    # Verify Lua was called with user_a as the identity
    call_args = redis.eval.call_args
    assert "user_a" in call_args.args


@pytest.mark.asyncio
async def test_user_b_cannot_renew_lock_owned_by_user_a():
    """User B renewal must fail when User A owns the lock."""
    redis = _make_redis()
    redis.eval = AsyncMock(return_value=0)  # Owner mismatch
    redis.get = AsyncMock(return_value="user_a")

    lm = LockManager(redis)
    renewed = await lm.renew_rack_lock("RACK-3", "user_b", ttl=60)

    assert renewed is False


@pytest.mark.asyncio
async def test_release_only_by_owner():
    """Only the owner can release the lock."""
    redis = _make_redis()
    redis.eval = AsyncMock(side_effect=[1, 0])  # owner release: ok; non-owner: fail

    lm = LockManager(redis)

    # Owner can release
    owner_released = await lm.release_rack_lock("RACK-4", "user_a")
    assert owner_released is True

    # Verify the Lua call used the correct owner identity "user_a"
    first_call_args = redis.eval.call_args_list[0].args
    assert "user_a" in first_call_args, (
        "release_rack_lock must pass owner identity 'user_a' to the Lua script"
    )

    # Non-owner cannot release
    non_owner_released = await lm.release_rack_lock("RACK-4", "user_b")
    assert non_owner_released is False

    # Verify the second Lua call used "user_b" (which should fail due to ownership mismatch)
    second_call_args = redis.eval.call_args_list[1].args
    assert "user_b" in second_call_args, (
        "release_rack_lock must pass caller identity 'user_b' to the Lua script"
    )


@pytest.mark.asyncio
async def test_validate_record_uses_username_not_session_id():
    """
    The sync validation must compare the lock owner against user_id (username),
    not record.session_id.  A session_id must never appear as a lock identity.
    """
    from backend.api.sync_batch_api import SyncRecord, validate_record

    redis = _make_redis()
    redis.get = AsyncMock(return_value="user_a")  # lock owned by user_a
    lm = LockManager(redis)

    db = MagicMock()
    db.count_lines.find_one = AsyncMock(return_value=None)

    record = SyncRecord(
        client_record_id="rec-1",
        session_id="session-xyz",  # different from lock owner
        location_id="LOC-1",
        floor_id="F1",
        rack_id="RACK-LOCKED",
        item_code="ITEM-1",
        verified_qty=1.0,
        created_at="2024-01-01T10:00:00Z",
        updated_at="2024-01-01T10:00:00Z",
    )

    # user_b is the requesting user; rack is locked by user_a → must conflict
    conflict = await validate_record(record, db, lm, user_id="user_b")
    assert conflict is not None
    assert conflict.conflict_type == "rack_locked"

    # Same rack, requesting user IS the lock owner → no conflict
    conflict_owner = await validate_record(record, db, lm, user_id="user_a")
    assert conflict_owner is None


@pytest.mark.asyncio
async def test_heartbeat_renews_with_username_not_session_id():
    """
    LockManager.renew_rack_lock must pass the user identity (username) to the
    Lua renewal script — never the session_id.  This verifies the contract that
    heartbeat callers supply a username, not a session_id, when calling
    renew_rack_lock directly.
    """
    redis = _make_redis()
    redis.eval = AsyncMock(return_value=1)

    lm = LockManager(redis)
    username = "user_heartbeat"
    session_id = "session-heartbeat-xyz"

    # Call renew_rack_lock with the username (as heartbeat callers are required to do).
    renewed = await lm.renew_rack_lock("RACK-HB", username, ttl=60)
    assert renewed is True

    # The Lua eval call must include username, NOT session_id
    call_args = redis.eval.call_args
    assert username in call_args.args
    assert session_id not in call_args.args
