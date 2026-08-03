"""OCC regression tests for the count-line write paths.

Context: the count-line write helpers previously did NOT pass
``expected_session_version`` into ``CountLineWriteService.process_write``.
Because ``_capture_session_versions`` only enforces optimistic concurrency
when that key is present, session version governance was silently bypassed on
the count-line create/merge paths. These tests lock in the fix:

1. ``_persist_count_line_document`` threads ``expected_session_version`` equal
   to the loaded session's version into the write context.
2. A ``ConcurrencyError`` raised by the write service propagates out of the
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
    """Replace MongoUnitOfWork with a no-op async context manager."""
    tx = MagicMock(name="tx")

    @asynccontextmanager
    async def _fake_tx(_client):
        yield tx

    monkeypatch.setattr(clr, "MongoUnitOfWork", _fake_tx)
    return tx


def _fake_db() -> MagicMock:
    db = MagicMock(name="db")
    # Draft update runs inside the helper; return a non-awaitable so the
    # `inspect.isawaitable(...)` branch is skipped.
    db.count_line_drafts.update_many = MagicMock(return_value=MagicMock())
    return db


@pytest.mark.asyncio
async def test_persist_count_line_threads_expected_session_version(monkeypatch):
    _patch_transaction(monkeypatch)
    write_service = AsyncMock()

    await clr._persist_count_line_document(
        _fake_db(),
        _line_data(),
        "user1",
        _count_line(),
        datetime.now(timezone.utc),
        None,  # recount_update_target
        write_service=write_service,
        session={"id": "sess-occ", "session_id": "sess-occ", "version": 7},
    )

    assert write_service.process_write.await_count >= 1
    ctx = write_service.process_write.call_args_list[0].kwargs["context"]
    assert ctx["expected_session_version"] == 7, (
        "create path must thread the loaded session version for OCC enforcement"
    )


@pytest.mark.asyncio
async def test_persist_count_line_coerces_missing_version_to_zero(monkeypatch):
    _patch_transaction(monkeypatch)
    write_service = AsyncMock()

    await clr._persist_count_line_document(
        _fake_db(),
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
async def test_persist_count_line_propagates_concurrency_error(monkeypatch):
    _patch_transaction(monkeypatch)
    write_service = AsyncMock()
    write_service.process_write.side_effect = ConcurrencyError(
        "CRITICAL: Session version mismatch for sess-occ: expected 7, current 8"
    )

    with pytest.raises(ConcurrencyError):
        await clr._persist_count_line_document(
            _fake_db(),
            _line_data(),
            "user1",
            _count_line(),
            datetime.now(timezone.utc),
            None,
            write_service=write_service,
            session={"id": "sess-occ", "session_id": "sess-occ", "version": 7},
        )
