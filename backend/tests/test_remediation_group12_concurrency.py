"""
FIX GROUP 12 — Regression tests: Concurrency hardening.

Simulates concurrent counting, syncing, and approvals to verify:
  - No duplicate counts
  - No lost updates
  - No quantity inflation
  - No lock violations
  - OCC version guard works
"""

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.services.concurrency import ConcurrencyError, build_version_filter, coerce_version
from backend.services.lock_manager import LockManager

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_redis_with_state() -> MagicMock:
    """Simulates atomic Redis state."""
    state: dict[str, str] = {}

    async def _set(key, value, ex=None, nx=False, **kwargs):
        if nx and key in state:
            return None  # Already exists
        state[key] = str(value)
        return True

    async def _get(key):
        return state.get(key)

    async def _eval(script, numkeys, *args):
        # Simulate Lua compare-and-delete / compare-and-expire
        key = args[0]
        expected = args[1]
        current = state.get(key)
        if current == expected:
            if len(args) > 2:  # renew
                return 1
            del state[key]
            return 1
        return 0

    async def _delete(key):
        state.pop(key, None)
        return 1

    redis = MagicMock()
    redis.set = _set
    redis.get = _get
    redis.eval = _eval
    redis.delete = _delete
    redis.exists = AsyncMock(return_value=0)
    return redis


# ---------------------------------------------------------------------------
# Lock contention tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_two_users_cannot_acquire_same_rack_lock():
    redis = _make_redis_with_state()
    lm = LockManager(redis)

    results = await asyncio.gather(
        lm.acquire_rack_lock("RACK-CC", "user_a", ttl=60),
        lm.acquire_rack_lock("RACK-CC", "user_b", ttl=60),
    )
    # Exactly one must succeed
    assert sorted(results) == [False, True]


@pytest.mark.asyncio
async def test_five_concurrent_lock_attempts_only_one_wins():
    redis = _make_redis_with_state()
    lm = LockManager(redis)

    results = await asyncio.gather(
        *[lm.acquire_rack_lock("RACK-5X", f"user_{i}", ttl=60) for i in range(5)]
    )
    assert results.count(True) == 1
    assert results.count(False) == 4


@pytest.mark.asyncio
async def test_ten_concurrent_lock_attempts_only_one_wins():
    redis = _make_redis_with_state()
    lm = LockManager(redis)

    results = await asyncio.gather(
        *[lm.acquire_rack_lock("RACK-10X", f"user_{i}", ttl=60) for i in range(10)]
    )
    assert results.count(True) == 1
    assert results.count(False) == 9


# ---------------------------------------------------------------------------
# OCC version guard
# ---------------------------------------------------------------------------


def test_coerce_version_handles_none():
    assert coerce_version(None) == 0


def test_coerce_version_handles_int():
    assert coerce_version(3) == 3


def test_coerce_version_handles_string():
    assert coerce_version("5") == 5


def test_build_version_filter_produces_correct_filter():
    f = build_version_filter(3)
    assert f == {"version": 3}


@pytest.mark.asyncio
async def test_session_version_mismatch_raises_concurrency_error():
    """
    Simulating two concurrent writes to the same session:
    the second write must fail with ConcurrencyError when version has changed.
    """
    from backend.services.count_line_write_service import CountLineWriteService

    db = MagicMock()
    db.sessions = MagicMock()

    # Session at version 1
    db.sessions.find_one = AsyncMock(
        return_value={
            "id": "sess-cc",
            "session_id": "sess-cc",
            "status": "ACTIVE",
            "version": 1,
        }
    )
    db.sessions.update_one = AsyncMock(
        return_value=MagicMock(modified_count=0)  # version mismatch
    )
    db.session_snapshots = MagicMock()
    db.session_snapshots.find_one = AsyncMock(
        return_value={"session_id": "sess-cc", "snapshot_hash": "h", "items": []}
    )
    db.count_lines = MagicMock()
    db.count_lines.find_one = AsyncMock(return_value=None)
    db.count_lines.insert_one = AsyncMock(return_value=MagicMock(inserted_id="abc"))
    db.count_lines.find = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))
    db.governance_events = MagicMock()
    db.governance_events.insert_one = AsyncMock(return_value=None)
    db.erp_items = MagicMock()
    db.erp_items.find_one = AsyncMock(return_value=None)

    service = CountLineWriteService(db)
    service.resolve_baseline = AsyncMock(return_value=(0.0, "hash"))
    service.audit_service.log_governance_event = AsyncMock(return_value=None)
    service.projection_service.sync_for_sessions = AsyncMock(return_value=None)

    with pytest.raises(ConcurrencyError):
        await service._update_session_totals_for_sessions(
            session_ids=["sess-cc"],
            context={"username": "user1", "expected_session_version": 99},  # wrong version
            db_session=None,
            expected_versions={"sess-cc": 99},
        )


# ---------------------------------------------------------------------------
# Idempotency: no duplicate counts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_parallel_sync_of_same_record_is_idempotent():
    """
    Simulating 5 parallel syncs of the same client_record_id.
    Only one write should be committed; the rest are idempotency no-ops.
    """
    from backend.api.sync_batch_api import SyncRecord, sync_single_record
    from backend.services.session_lifecycle_service import SessionLifecycleService as SLS

    session_id = str(uuid.uuid4())
    client_record_id = f"rec-{uuid.uuid4()}"

    write_count = 0

    class CountingWriteService:
        async def process_write(self, payload, context=None):
            nonlocal write_count
            write_count += 1

    db = MagicMock()
    db.sessions.find_one = AsyncMock(
        return_value={
            "id": session_id,
            "session_id": session_id,
            "status": "ACTIVE",
            "staff_user": "staff1",
        }
    )
    db.session_snapshots.find_one = AsyncMock(
        return_value={
            "session_id": session_id,
            "snapshot_hash": "h",
            "items": [{"item_code": "ITEM-P", "stock_qty": 0.0}],
        }
    )
    # First call returns None (not yet seen); subsequent calls return existing
    call_index = 0

    async def _find_one(query, **kwargs):
        nonlocal call_index
        # If the query is for idempotency_key, simulate that after first write it exists.
        if "idempotency_key" in str(query):
            if call_index > 0:
                return {"session_id": session_id, "idempotency_key": client_record_id}
            call_index += 1
            return None
        return None

    db.count_lines.find_one = _find_one
    db.erp_items.find_one = AsyncMock(return_value={"item_code": "ITEM-P", "stock_qty": 0.0})

    sls = SLS.__new__(SLS)
    sls.db = db
    sls.ensure_session_active = AsyncMock(
        return_value={
            "id": session_id,
            "session_id": session_id,
            "status": "ACTIVE",
            "staff_user": "staff1",
        }
    )

    record = SyncRecord(
        client_record_id=client_record_id,
        session_id=session_id,
        location_id="LOC-1",
        floor_id="F1",
        rack_id="R1",
        item_code="ITEM-P",
        verified_qty=1.0,
        serial_numbers=["SN-PAR-1"],
        created_at="2024-01-01T10:00:00Z",
        updated_at="2024-01-01T10:00:00Z",
    )

    write_svc = CountingWriteService()
    tasks = [
        sync_single_record(record, db, "staff1", write_service=write_svc, lifecycle_service=sls)
        for _ in range(5)
    ]
    results = await asyncio.gather(*tasks)

    successes = [r for r, _ in results if r]
    assert len(successes) >= 1
    assert write_count <= 1, f"Expected ≤1 write, got {write_count} (no inflation)"
