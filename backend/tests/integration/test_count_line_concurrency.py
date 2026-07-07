"""
Real MongoDB concurrency integration tests (BSR Part C).

InMemoryDatabase (used by the rest of the suite) does not implement unique
index enforcement, so it cannot exercise the actual production race window
between the application-level pre-check and MongoDB's own unique index on
count_lines.idempotency_key / count_lines.semantic_hash. These tests use a
real local MongoDB instance (via the `mongo_client` fixture) and genuinely
concurrent asyncio tasks to exercise that race for real, calling the same
production duplicate-recovery code (_persist_count_line_or_recover_duplicate
in count_lines_routes.py) that create_count_line uses.

Note on scope: these tests call the count-line write pipeline directly
(the same _prepare_and_persist_count_line steps the batch endpoint uses)
rather than going through the full create_count_line HTTP route. Driving
two literally-concurrent requests through the full route also races an
unrelated session-level optimistic-concurrency check (session.version, bumped
by _recompute_session_totals after each write) -- with the Redis lock service
disabled (as it is in this test process), that produces a spurious 409
"Session was modified concurrently" for the loser even for a true idempotent
retry, which is a separate, pre-existing concern from the duplicate-submission
handling BSR Part C asks about. That interaction is called out in the BSR
report's Remaining Gaps as worth a follow-up test in an environment with the
real lock service wired in.

Requires a reachable MongoDB at MONGO_URL (see backend/tests/conftest.py).

Marked `manual` (excluded from the default `-m "not manual"` suite run, see
pytest.ini): running two real AsyncIOMotorClient instances back-to-back in
the same pytest session as other, unrelated async test files has been
observed to occasionally raise "Cannot use MongoClient after close" from a
prior test file's event-loop/client teardown interacting with this one --
a pytest-asyncio/Motor test-infra fragility, not a flake in the assertions
themselves (this file's two tests pass reliably, repeatedly, when run
alone: `pytest backend/tests/integration/test_count_line_concurrency.py`).
Run explicitly with `-m manual` or by direct path as its own step.
"""

import asyncio
import os
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

import backend.api.count_lines_routes as count_lines_routes
from backend.api.schemas import CountLineCreate
from backend.db.indexes import create_indexes
from backend.models.audit import AuditEventType
from backend.services.canonical_inventory import find_session

pytestmark = pytest.mark.manual


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.fixture
async def real_db(mongo_client):
    db_name = os.getenv("DB_NAME")
    db = mongo_client[db_name]
    await create_indexes(db)
    return db


@pytest.fixture(autouse=True)
def _reset_route_globals(monkeypatch):
    # Match the pattern used elsewhere in the suite: disable optional
    # integrations (locking, activity log, snapshot cache, variant service)
    # that are irrelevant to the duplicate-submission race being tested.
    monkeypatch.setattr(count_lines_routes, "_activity_log_service", None)
    monkeypatch.setattr(count_lines_routes, "_lock_service", None)
    monkeypatch.setattr(count_lines_routes, "_snapshot_service", None)
    monkeypatch.setattr(count_lines_routes, "_variant_service", None)


async def _seed_common_fixtures(real_db, *, session_id: str, item_code: str) -> None:
    now = _utc_now()
    await real_db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "status": "ACTIVE",
            "started_at": now,
        }
    )
    await real_db.erp_items.insert_one(
        {
            "item_code": item_code,
            "barcode": f"BC-{item_code}",
            "item_name": "Concurrency Test Item",
            "stock_qty": 100.0,
            "mrp": 50.0,
        }
    )
    await real_db.session_snapshots.insert_one(
        {
            "session_id": session_id,
            "snapshot_hash": f"hash-{session_id}",
            "items": [{"item_code": item_code, "stock_qty": 100.0}],
        }
    )


def _make_line_data(
    *, session_id: str, item_code: str, idempotency_key: str, counted_qty: float = 100.0
) -> CountLineCreate:
    return CountLineCreate(
        session_id=session_id,
        location_id="LOC-1",
        floor_id="F1",
        rack_id="R1",
        item_code=item_code,
        idempotency_key=idempotency_key,
        counted_qty=counted_qty,
        floor_no="F1",
        rack_no="R1",
    )


async def _submit_count_line(db, line_data: CountLineCreate, current_user: dict):
    """Exercise the real production write + duplicate-recovery pipeline
    directly, avoiding the unrelated session-OCC confound of the full HTTP
    route (see module docstring). This is the exact same
    _prepare_and_persist_count_line single source of truth that both the
    single-submit and batch endpoints call."""
    session = await find_session(db, line_data.session_id)
    write_service = count_lines_routes._get_count_line_write_service(db)
    count_line, _counted_at, _is_existing_retry = (
        await count_lines_routes._prepare_and_persist_count_line(
            db,
            line_data,
            current_user,
            session=session,
            write_service=write_service,
        )
    )
    return count_line


async def _submit(db, line_data: CountLineCreate, username: str):
    try:
        return await _submit_count_line(
            db, line_data, current_user={"username": username, "role": "staff"}
        )
    except HTTPException as exc:
        return exc


@pytest.mark.asyncio
async def test_concurrent_same_idempotency_key_persists_exactly_once(real_db):
    """Two truly simultaneous submissions with the SAME idempotency_key must
    result in exactly one persisted document, neither request may raise a
    raw 500, both must get a success/existing result (BSR rule #17), and no
    DUPLICATE_SCAN_ATTEMPT audit may be written for this true retry."""
    session_id = "concur-sess-idem"
    item_code = "ITEM-CONCUR-IDEM"
    idempotency_key = "concur-idem-key-1"
    await _seed_common_fixtures(real_db, session_id=session_id, item_code=item_code)

    line_a = _make_line_data(
        session_id=session_id, item_code=item_code, idempotency_key=idempotency_key
    )
    line_b = _make_line_data(
        session_id=session_id, item_code=item_code, idempotency_key=idempotency_key
    )

    result_a, result_b = await asyncio.gather(
        _submit(real_db, line_a, "staff-a"), _submit(real_db, line_b, "staff-b")
    )

    for result in (result_a, result_b):
        assert not isinstance(result, HTTPException), (
            f"Expected success/existing result for true idempotent retry, got HTTPException: "
            f"{getattr(result, 'detail', result)}"
        )

    persisted = await real_db.count_lines.count_documents(
        {"session_id": session_id, "idempotency_key": idempotency_key}
    )
    assert persisted == 1, "Exactly one count_line must be persisted for a true retry"

    assert result_a["id"] == result_b["id"]

    false_duplicate_audits = await real_db.audit_logs.count_documents(
        {
            "event_type": AuditEventType.DUPLICATE_SCAN_ATTEMPT.value,
            "session_id": session_id,
            "item_code": item_code,
        }
    )
    assert false_duplicate_audits == 0, (
        "A true idempotent retry must not be recorded as a duplicate scan (BSR rule #17)"
    )


@pytest.mark.asyncio
async def test_concurrent_different_idempotency_key_same_content_rejects_loser(real_db):
    """Two truly simultaneous submissions with DIFFERENT idempotency_keys but
    identical semantic content (same session/item/location/qty/version) must
    result in exactly one persisted document; the race loser must get a
    clean 409 duplicate/conflict response (never a raw 500), and a
    DUPLICATE_SCAN_ATTEMPT audit must be recorded for the rejection.

    The exact reason_code (SAME_LOCATION_DUPLICATE vs SEMANTIC_DUPLICATE)
    depends on which internal check wins the real race and is not asserted
    here -- both are legitimate outcomes of a genuine concurrent duplicate.
    """
    session_id = "concur-sess-semantic"
    item_code = "ITEM-CONCUR-SEM"
    await _seed_common_fixtures(real_db, session_id=session_id, item_code=item_code)

    line_a = _make_line_data(
        session_id=session_id,
        item_code=item_code,
        idempotency_key="concur-sem-key-a",
        counted_qty=100.0,
    )
    line_b = _make_line_data(
        session_id=session_id,
        item_code=item_code,
        idempotency_key="concur-sem-key-b",
        counted_qty=100.0,
    )

    result_a, result_b = await asyncio.gather(
        _submit(real_db, line_a, "staff-a"), _submit(real_db, line_b, "staff-b")
    )

    results = [result_a, result_b]
    successes = [r for r in results if not isinstance(r, HTTPException)]
    failures = [r for r in results if isinstance(r, HTTPException)]

    assert len(successes) == 1, "Exactly one concurrent submission should win"
    assert len(failures) == 1, "Exactly one concurrent submission should be rejected"
    assert failures[0].status_code == 409, "Loser must get a clean 409, never a raw 500"

    persisted = await real_db.count_lines.count_documents({"session_id": session_id})
    assert persisted == 1, "Exactly one count_line must be persisted for genuine duplicates"

    duplicate_audits = await real_db.audit_logs.count_documents(
        {
            "event_type": AuditEventType.DUPLICATE_SCAN_ATTEMPT.value,
            "session_id": session_id,
            "item_code": item_code,
        }
    )
    assert duplicate_audits >= 1, "The rejected duplicate must be audited"
