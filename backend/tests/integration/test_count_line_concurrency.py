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

Note on scope: the first two tests below call the count-line write pipeline
directly (the same _prepare_and_persist_count_line steps the batch endpoint
uses) rather than going through the full create_count_line HTTP route, to
isolate the duplicate-submission race from unrelated request-level concerns.
The tests further down (TestFullRouteConcurrency) exercise the full HTTP
route for the same scenarios, plus the session-level OCC fix from BSR Part
B: session.version being bumped by an unrelated write (another user's post-
persist totals recompute, or this session's own first-time logic-version
pin) used to cause a spurious "Session was modified concurrently" 409 for
requests that weren't actually conflicting with anything -- fixed by reading
the session version fresh immediately before each write instead of reusing
the value captured at request start (see count_lines_routes.
_persist_count_line_document and logic_guard.persist_pin_if_needed).

TestBatchConcurrency (BSR Part A follow-up, batch concurrency verification):
create_count_lines_batch shares _prepare_and_persist_count_line with the
single-submit route (verified this pass, not assumed), but that only proves
the *per-line* logic is identical -- it doesn't prove two concurrent full
batch *requests* behave correctly, since each batch request also calls
_enforce_count_line_session_logic (the same first-time logic-pin path fixed
in BSR Part B) once per request, and loops multiple lines sequentially
within itself. These tests drive create_count_lines_batch itself under real
concurrency to prove that end-to-end, not just the shared helper in
isolation.

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
from unittest.mock import patch

import pytest
from backend.api import count_lines_routes
from backend.api.count_lines_routes import (
    CountLineBatchCreate,
    create_count_line,
    create_count_lines_batch,
)
from backend.api.schemas import CountLineCreate
from backend.db.indexes import create_indexes
from backend.models.audit import AuditEventType
from backend.services.canonical_inventory import find_session
from fastapi import HTTPException

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
    (
        count_line,
        _counted_at,
        _is_existing_retry,
    ) = await count_lines_routes._prepare_and_persist_count_line(
        db,
        line_data,
        current_user,
        session=session,
        write_service=write_service,
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


class _FakeRequest:
    client = None
    headers: dict = {}
    url = type("_U", (), {"path": "/api/count-lines"})()
    method = "POST"


async def _submit_full_route(db, line_data: CountLineCreate, username: str):
    try:
        with patch("backend.api.count_lines_routes.get_db", return_value=db):
            return await create_count_line(
                request=_FakeRequest(),
                line_data=line_data,
                current_user={"username": username, "role": "staff"},
            )
    except HTTPException as exc:
        return exc


class TestFullRouteConcurrency:
    """BSR Part B: the full create_count_line HTTP route (not just the
    reduced write pipeline above) must not spuriously reject logically
    non-conflicting concurrent count-line submissions to the same session.
    """

    @pytest.mark.asyncio
    async def test_full_route_same_idempotency_key_persists_exactly_once(self, real_db):
        session_id = "concur-full-idem"
        item_code = "ITEM-FULL-IDEM"
        idempotency_key = "concur-full-idem-key"
        await _seed_common_fixtures(real_db, session_id=session_id, item_code=item_code)

        line_a = _make_line_data(
            session_id=session_id, item_code=item_code, idempotency_key=idempotency_key
        )
        line_b = _make_line_data(
            session_id=session_id, item_code=item_code, idempotency_key=idempotency_key
        )

        result_a, result_b = await asyncio.gather(
            _submit_full_route(real_db, line_a, "staff-a"),
            _submit_full_route(real_db, line_b, "staff-b"),
        )

        for result in (result_a, result_b):
            assert not isinstance(result, HTTPException), (
                "A true idempotent retry through the full route must not fail with "
                f"a session-version conflict: {getattr(result, 'detail', result)}"
            )
        assert result_a["id"] == result_b["id"]

        persisted = await real_db.count_lines.count_documents({"session_id": session_id})
        assert persisted == 1

    @pytest.mark.asyncio
    async def test_full_route_different_items_same_session_both_succeed(self, real_db):
        """Two different staff counting two different items in the same
        session concurrently must not fail just because an unrelated
        session-state write (this session's own first-time logic-version
        pin) touched session.version in between."""
        session_id = "concur-full-multi-item"
        item_a, item_b = "ITEM-FULL-A", "ITEM-FULL-B"
        await _seed_common_fixtures(real_db, session_id=session_id, item_code=item_a)
        await real_db.erp_items.insert_one(
            {
                "item_code": item_b,
                "barcode": f"BC-{item_b}",
                "item_name": "Concurrency Test Item B",
                "stock_qty": 100.0,
                "mrp": 50.0,
            }
        )
        # _seed_common_fixtures only seeded the baseline snapshot for item_a;
        # add item_b so its counted_qty=100.0 also resolves to zero variance
        # (matching item_a) and doesn't require a correction_reason.
        await real_db.session_snapshots.update_one(
            {"session_id": session_id},
            {"$push": {"items": {"item_code": item_b, "stock_qty": 100.0}}},
        )

        line_a = _make_line_data(
            session_id=session_id,
            item_code=item_a,
            idempotency_key="concur-full-multi-key-a",
        )
        line_b = _make_line_data(
            session_id=session_id,
            item_code=item_b,
            idempotency_key="concur-full-multi-key-b",
        )

        result_a, result_b = await asyncio.gather(
            _submit_full_route(real_db, line_a, "staff-a"),
            _submit_full_route(real_db, line_b, "staff-b"),
        )

        for label, result in (("a", result_a), ("b", result_b)):
            assert not isinstance(result, HTTPException), (
                f"Two different items in the same session must not conflict "
                f"(line {label}): {getattr(result, 'detail', result)}"
            )

        persisted = await real_db.count_lines.count_documents({"session_id": session_id})
        assert persisted == 2

    @pytest.mark.asyncio
    async def test_finalized_session_blocks_full_route_mutation_cleanly(self, real_db):
        """A finalized session must still hard-block new count-line writes,
        with a clean 409 -- never a raw 500 (this also regression-covers the
        persist_pin_if_needed -> GovernanceViolation -> raw-500 bug found
        while fixing the OCC false-positive)."""
        session_id = "concur-full-finalized"
        item_code = "ITEM-FULL-FINALIZED"
        await real_db.sessions.insert_one(
            {
                "id": session_id,
                "session_id": session_id,
                "status": "FINALIZED",
                "version": 0,
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

        line_data = _make_line_data(
            session_id=session_id, item_code=item_code, idempotency_key="concur-full-fin-key"
        )
        result = await _submit_full_route(real_db, line_data, "staff-a")

        assert isinstance(result, HTTPException)
        assert result.status_code == 409
        assert "finalized" in str(result.detail).lower()


async def _submit_batch(db, batch: CountLineBatchCreate, username: str):
    """Drive create_count_lines_batch itself (not the shared per-line
    helper) so a raw 500 at the batch-request level -- as opposed to a
    structured per-line error -- would actually be caught."""
    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        return await create_count_lines_batch(
            request=_FakeRequest(),
            batch_data=batch,
            current_user={"username": username, "role": "staff"},
        )


class TestBatchConcurrency:
    """BSR Part A follow-up: create_count_lines_batch under real concurrent
    conditions, not just the shared per-line helper in isolation."""

    @pytest.mark.asyncio
    async def test_two_concurrent_batches_same_idempotency_key_persist_once(self, real_db):
        """Two concurrent batch requests, each with one line, same
        session/item/location/idempotency_key: exactly one persisted
        document, neither batch call raises, both report the line as a
        success (one as the winner, one as idempotent_retry), and no false
        DUPLICATE_SCAN_ATTEMPT audit for the true retry."""
        session_id = "concur-batch-idem"
        item_code = "ITEM-BATCH-IDEM"
        idempotency_key = "concur-batch-idem-key"
        await _seed_common_fixtures(real_db, session_id=session_id, item_code=item_code)

        batch_a = CountLineBatchCreate(
            session_id=session_id,
            lines=[
                _make_line_data(
                    session_id=session_id, item_code=item_code, idempotency_key=idempotency_key
                )
            ],
        )
        batch_b = CountLineBatchCreate(
            session_id=session_id,
            lines=[
                _make_line_data(
                    session_id=session_id, item_code=item_code, idempotency_key=idempotency_key
                )
            ],
        )

        response_a, response_b = await asyncio.gather(
            _submit_batch(real_db, batch_a, "staff-a"),
            _submit_batch(real_db, batch_b, "staff-b"),
        )

        for response in (response_a, response_b):
            assert response["failed"] == 0, f"Expected no failures, got: {response['errors']}"
            assert response["created"] == 1
            assert response["results"][0]["success"] is True

        persisted = await real_db.count_lines.count_documents(
            {"session_id": session_id, "idempotency_key": idempotency_key}
        )
        assert persisted == 1, "Exactly one count_line must be persisted for a true retry"

        ids = {response_a["results"][0]["id"], response_b["results"][0]["id"]}
        assert len(ids) == 1, "Both batch responses must reference the same persisted line"

        # Exactly one of the two calls is the "real" insert; the other is
        # the idempotent-retry recovery. Order isn't guaranteed under real
        # concurrency, so check the union of both responses.
        retry_flags = [
            response_a["results"][0]["idempotent_retry"],
            response_b["results"][0]["idempotent_retry"],
        ]
        assert True in retry_flags, "At least one response must report idempotent_retry"

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
    async def test_two_concurrent_batches_genuine_duplicate_race(self, real_db):
        """Two concurrent batch requests, each with one line, same
        session/item/location, different idempotency_key, same semantic
        content: exactly one persisted, the loser's batch response carries
        a structured per-line error (never a raw 500 at the batch level),
        and DUPLICATE_SCAN_ATTEMPT is audited for the rejection."""
        session_id = "concur-batch-semantic"
        item_code = "ITEM-BATCH-SEM"
        await _seed_common_fixtures(real_db, session_id=session_id, item_code=item_code)

        batch_a = CountLineBatchCreate(
            session_id=session_id,
            lines=[
                _make_line_data(
                    session_id=session_id,
                    item_code=item_code,
                    idempotency_key="concur-batch-sem-key-a",
                    counted_qty=100.0,
                )
            ],
        )
        batch_b = CountLineBatchCreate(
            session_id=session_id,
            lines=[
                _make_line_data(
                    session_id=session_id,
                    item_code=item_code,
                    idempotency_key="concur-batch-sem-key-b",
                    counted_qty=100.0,
                )
            ],
        )

        response_a, response_b = await asyncio.gather(
            _submit_batch(real_db, batch_a, "staff-a"),
            _submit_batch(real_db, batch_b, "staff-b"),
        )

        responses = [response_a, response_b]
        successes = [r for r in responses if r["created"] == 1 and r["failed"] == 0]
        failures = [r for r in responses if r["failed"] == 1 and r["created"] == 0]

        assert len(successes) == 1, f"Exactly one batch should succeed: {responses}"
        assert len(failures) == 1, f"Exactly one batch should fail cleanly: {responses}"

        loser_error = failures[0]["errors"][0]
        assert loser_error["success"] is False
        assert loser_error["error_code"] in ("SEMANTIC_DUPLICATE", "DUPLICATE_SCAN_ATTEMPT")
        assert loser_error["line_index"] == 0
        assert loser_error["item_code"] == item_code

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

    @pytest.mark.asyncio
    async def test_mixed_batch_new_retry_and_duplicate_lines(self, real_db):
        """One batch with three lines -- new, true idempotent retry, and
        genuine duplicate -- must succeed on the first two without being
        rolled back by the third, and audit only the genuine duplicate."""
        session_id = "concur-batch-mixed"
        item_new, item_retry, item_dup = (
            "ITEM-BATCH-MIXED-NEW",
            "ITEM-BATCH-MIXED-RETRY",
            "ITEM-BATCH-MIXED-DUP",
        )
        await real_db.sessions.insert_one(
            {"id": session_id, "session_id": session_id, "status": "ACTIVE", "version": 0}
        )
        for item_code in (item_new, item_retry, item_dup):
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
                "items": [
                    {"item_code": item_code, "stock_qty": 100.0}
                    for item_code in (item_new, item_retry, item_dup)
                ],
            }
        )

        # Pre-existing line B's target: same idempotency_key as what the
        # batch will submit for item_retry -- a true retry.
        await real_db.count_lines.insert_one(
            {
                "id": "existing-retry-line",
                "session_id": session_id,
                "item_code": item_retry,
                "idempotency_key": "mixed-retry-key",
                "floor_no": "F1",
                "rack_no": "R1",
                "status": "pending",
                "version": 1,
            }
        )
        # Pre-existing line C's target: same location, different
        # idempotency_key than what the batch will submit for item_dup --
        # a genuine same-location duplicate.
        await real_db.count_lines.insert_one(
            {
                "id": "existing-dup-line",
                "session_id": session_id,
                "item_code": item_dup,
                "idempotency_key": "mixed-dup-original-key",
                "floor_no": "F1",
                "rack_no": "R1",
                "status": "pending",
                "version": 1,
            }
        )

        batch = CountLineBatchCreate(
            session_id=session_id,
            lines=[
                _make_line_data(  # line A: brand new
                    session_id=session_id, item_code=item_new, idempotency_key="mixed-new-key"
                ),
                _make_line_data(  # line B: true idempotent retry
                    session_id=session_id, item_code=item_retry, idempotency_key="mixed-retry-key"
                ),
                _make_line_data(  # line C: genuine duplicate (different key, same location)
                    session_id=session_id, item_code=item_dup, idempotency_key="mixed-dup-new-key"
                ),
            ],
        )

        response = await _submit_batch(real_db, batch, "staff-a")

        assert response["created"] == 2, f"Expected lines A and B to succeed: {response}"
        assert response["failed"] == 1, f"Expected line C to fail: {response}"

        results_by_index = {r["index"]: r for r in response["results"]}
        assert 0 in results_by_index and results_by_index[0]["success"] is True
        assert results_by_index[0]["idempotent_retry"] is False
        assert 1 in results_by_index and results_by_index[1]["success"] is True
        assert results_by_index[1]["idempotent_retry"] is True
        assert results_by_index[1]["id"] == "existing-retry-line"

        assert len(response["errors"]) == 1
        error_c = response["errors"][0]
        assert error_c["line_index"] == 2
        assert error_c["item_code"] == item_dup
        assert error_c["success"] is False

        # Line A's new document exists and was not rolled back by line C's failure.
        line_a_doc = await real_db.count_lines.find_one(
            {"session_id": session_id, "item_code": item_new}
        )
        assert line_a_doc is not None

        # Only line C (the genuine duplicate) is audited; line B (true retry) is not.
        audits = await real_db.audit_logs.find(
            {"event_type": AuditEventType.DUPLICATE_SCAN_ATTEMPT.value, "session_id": session_id}
        ).to_list(None)
        audited_items = {a.get("item_code") for a in audits}
        assert item_dup in audited_items
        assert item_retry not in audited_items
        assert item_new not in audited_items

    @pytest.mark.asyncio
    async def test_batch_persists_normalized_uom_correctly(self, real_db):
        """BSR Priority #1 regression check for the batch path specifically.
        create_count_lines_batch's response only echoes back an id (not the
        full line), so there's nothing to compare it against directly --
        what matters is that the *persisted* document carries the item
        master's normalized UOM, not whatever pre-normalization value
        _build_count_line_document wrote before insert_one ran. This proves
        CountLineWriteService._run_post_write_validation's post-insert sync
        (fixed under Priority #1) applies to batch inserts too, since it's
        a caller-agnostic fix inside the shared write service."""
        session_id = "concur-batch-uom"
        item_code = "ITEM-BATCH-UOM"
        await real_db.sessions.insert_one(
            {"id": session_id, "session_id": session_id, "status": "ACTIVE", "version": 0}
        )
        await real_db.erp_items.insert_one(
            {
                "item_code": item_code,
                "barcode": f"BC-{item_code}",
                "item_name": "Concurrency UOM Item",
                "stock_qty": 100.0,
                "mrp": 50.0,
                "uom_code": "BOX",
                "uom_name": "Box",
            }
        )
        await real_db.session_snapshots.insert_one(
            {
                "session_id": session_id,
                "snapshot_hash": f"hash-{session_id}",
                "items": [{"item_code": item_code, "stock_qty": 100.0}],
            }
        )

        line = _make_line_data(
            session_id=session_id, item_code=item_code, idempotency_key="batch-uom-key"
        )
        batch = CountLineBatchCreate(session_id=session_id, lines=[line])

        response = await _submit_batch(real_db, batch, "staff-a")
        assert response["created"] == 1

        persisted = await real_db.count_lines.find_one({"id": response["results"][0]["id"]})
        assert persisted["uom_code"] == "BOX"
        assert persisted["uom_name"] == "Box"
