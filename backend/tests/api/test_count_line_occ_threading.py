"""OCC regression tests for the count-line write paths.

Context: _persist_count_line_document originally threaded
``expected_session_version`` from the session snapshot captured at the
*start* of the whole request (before erp lookup, baseline resolve,
governance evaluation, lock acquisition, and -- critically -- this
session's own first-time logic-version pin, which itself bumps
session.version as a side effect). Any of those in-flight steps, or an
unrelated concurrent request finishing its post-persist totals recompute,
could bump session.version before this write's own OCC check ran, causing
a false "Session was modified concurrently" 409 even with no genuinely
conflicting write involved (BSR Part B).

Fixed by re-reading the session's version immediately before the write
instead of reusing the request-start snapshot, narrowing the OCC window to
just this write's own attempt while still catching a genuine concurrent
session-lifecycle change (e.g. finalization) landing in that narrow
window. These tests lock in the current, corrected behavior:

1. ``_persist_count_line_document`` threads ``expected_session_version``
   from a *fresh* read of the session, not the (possibly stale) session
   dict passed in by the caller.
2. A finalized session (per the fresh read) is rejected before any write
   is attempted, even if the caller's stale session snapshot still shows
   ACTIVE.
3. A ``ConcurrencyError`` raised by the write service propagates out of the
   helper (so the route layer can translate it into HTTP 409).

The service-level enforcement itself is covered by
``governance/test_transactional_write_enforcement.py``.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import backend.api.count_lines_routes as clr
import pytest
from backend.services.concurrency import ConcurrencyError
from backend.services.governance_guard import GovernanceViolation


def _line_data() -> SimpleNamespace:
    # Minimal attribute surface used by the draft-filter helpers.
    return SimpleNamespace(
        session_id="sess-occ",
        item_code="ITEM001",
        floor_no="F1",
        rack_no="R1",
        mark_location="",
    )


def _count_line() -> dict:
    return {
        "id": "cl-occ-1",
        "location_id": None,
        "floor_id": None,
        "rack_id": None,
    }


def _patch_transaction(monkeypatch) -> MagicMock:
    """Replace mongo_transaction with a no-op async context manager."""
    tx = MagicMock(name="tx")

    @asynccontextmanager
    async def _fake_tx(_client):
        yield tx

    monkeypatch.setattr(clr, "mongo_transaction", _fake_tx)
    return tx


def _fake_db(*, fresh_session: dict | None) -> MagicMock:
    db = MagicMock(name="db")
    db.sessions.find_one = AsyncMock(return_value=fresh_session)
    # Draft update runs inside the helper; return a non-awaitable so the
    # `inspect.isawaitable(...)` branch is skipped.
    db.count_line_drafts.update_many = MagicMock(return_value=MagicMock())
    return db


@pytest.mark.asyncio
async def test_persist_count_line_threads_fresh_session_version(monkeypatch):
    _patch_transaction(monkeypatch)
    write_service = AsyncMock()

    # The caller's captured session snapshot says version=2 (stale, from
    # earlier in the request); the fresh read says version=7 (current).
    # The write must use the fresh value, not the stale one.
    await clr._persist_count_line_document(
        _fake_db(
            fresh_session={
                "id": "sess-occ",
                "session_id": "sess-occ",
                "status": "ACTIVE",
                "version": 7,
            }
        ),
        _line_data(),
        "user1",
        _count_line(),
        datetime.now(timezone.utc),
        None,  # recount_update_target
        write_service=write_service,
        session={"id": "sess-occ", "session_id": "sess-occ", "status": "ACTIVE", "version": 2},
    )

    assert write_service.process_write.await_count >= 1
    ctx = write_service.process_write.call_args_list[0].kwargs["context"]
    assert ctx["expected_session_version"] == 7, (
        "create path must thread the freshly-read session version, not the stale request-start snapshot"
    )


@pytest.mark.asyncio
async def test_persist_count_line_coerces_missing_version_to_zero(monkeypatch):
    _patch_transaction(monkeypatch)
    write_service = AsyncMock()

    await clr._persist_count_line_document(
        _fake_db(fresh_session={"id": "sess-occ", "session_id": "sess-occ", "status": "ACTIVE"}),
        _line_data(),
        "user1",
        _count_line(),
        datetime.now(timezone.utc),
        None,
        write_service=write_service,
        session={"id": "sess-occ", "session_id": "sess-occ"},  # legacy, no version
    )

    ctx = write_service.process_write.call_args_list[0].kwargs["context"]
    # coerce_version(None) -> 0; matches how legacy sessions read back -> no false conflict.
    assert ctx["expected_session_version"] == 0


@pytest.mark.asyncio
async def test_persist_count_line_rejects_freshly_finalized_session(monkeypatch):
    """If the session was finalized by a concurrent request since the
    caller's stale snapshot was captured, the fresh pre-write check must
    still catch it -- even though the caller's own session dict still says
    ACTIVE (BSR rule #9: finalized sessions are immutable)."""
    _patch_transaction(monkeypatch)
    write_service = AsyncMock()

    with pytest.raises(GovernanceViolation, match="finalized"):
        await clr._persist_count_line_document(
            _fake_db(
                fresh_session={
                    "id": "sess-occ",
                    "session_id": "sess-occ",
                    "status": "FINALIZED",
                    "finalized_at": datetime.now(timezone.utc),
                    "version": 9,
                }
            ),
            _line_data(),
            "user1",
            _count_line(),
            datetime.now(timezone.utc),
            None,
            write_service=write_service,
            session={"id": "sess-occ", "session_id": "sess-occ", "status": "ACTIVE", "version": 2},
        )

    write_service.process_write.assert_not_awaited()


@pytest.mark.asyncio
async def test_persist_count_line_propagates_concurrency_error(monkeypatch):
    _patch_transaction(monkeypatch)
    write_service = AsyncMock()
    write_service.process_write.side_effect = ConcurrencyError(
        "CRITICAL: Session version mismatch for sess-occ: expected 7, current 8"
    )

    with pytest.raises(ConcurrencyError):
        await clr._persist_count_line_document(
            _fake_db(
                fresh_session={
                    "id": "sess-occ",
                    "session_id": "sess-occ",
                    "status": "ACTIVE",
                    "version": 7,
                }
            ),
            _line_data(),
            "user1",
            _count_line(),
            datetime.now(timezone.utc),
            None,
            write_service=write_service,
            session={"id": "sess-occ", "session_id": "sess-occ", "status": "ACTIVE", "version": 7},
        )
