from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest

from backend.services.canonical_inventory import (
    is_blocking_finalization,
    is_count_line_effectively_reviewed,
    recompute_session_totals,
    recompute_session_totals_batch,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase


def test_non_variance_line_flagged_for_review_is_not_effectively_reviewed():
    assert (
        is_count_line_effectively_reviewed(
            {
                "status": "pending",
                "approval_status": "NEEDS_REVIEW",
                "variance": 0,
                "verified": False,
            }
        )
        is False
    )


def test_recount_assignment_blocks_finalization_even_without_variance():
    assert (
        is_blocking_finalization(
            {
                "status": "pending",
                "approval_status": "PENDING",
                "variance": 0,
                "verified": False,
                "assigned_to": "supervisor1",
                "recount_requested_at": datetime.now(timezone.utc).replace(tzinfo=None),
            }
        )
        is True
    )


@pytest.mark.asyncio
async def test_recompute_session_totals_batch_matches_single_session_calls():
    """The batched recompute must produce identical per-session totals to
    calling recompute_session_totals once per session -- it only changes how
    many `find()` queries are issued, not the aggregation result."""
    db = InMemoryDatabase()
    await db.count_lines.insert_many(
        [
            {"session_id": "session-A", "variance": 5.0, "damaged_qty": 0, "status": "approved"},
            {"session_id": "session-A", "variance": -2.0, "damaged_qty": 1, "status": "pending"},
            {"session_id": "session-B", "variance": 10.0, "damaged_qty": 0, "status": "approved"},
        ]
    )

    single_service_a = AsyncMock()
    await recompute_session_totals(db, "session-A", lifecycle_service=single_service_a)
    single_service_b = AsyncMock()
    await recompute_session_totals(db, "session-B", lifecycle_service=single_service_b)

    expected_a = single_service_a.update_session_totals.await_args.args[1]
    expected_b = single_service_b.update_session_totals.await_args.args[1]

    batch_service = AsyncMock()
    results = await recompute_session_totals_batch(
        db, ["session-A", "session-B"], lifecycle_service=batch_service
    )

    assert results["session-A"] == expected_a
    assert results["session-B"] == expected_b
    assert batch_service.update_session_totals.await_count == 2
    batch_service.update_session_totals.assert_any_await("session-A", expected_a)
    batch_service.update_session_totals.assert_any_await("session-B", expected_b)


@pytest.mark.asyncio
async def test_recompute_session_totals_batch_dedupes_and_handles_empty_session():
    db = InMemoryDatabase()
    await db.count_lines.insert_many(
        [{"session_id": "session-A", "variance": 1.0, "damaged_qty": 0, "status": "approved"}]
    )

    batch_service = AsyncMock()
    results = await recompute_session_totals_batch(
        db,
        ["session-A", "session-A", "session-empty"],
        lifecycle_service=batch_service,
    )

    assert results["session-A"]["total_items"] == 1
    assert results["session-empty"]["total_items"] == 0
    # Deduped input -> exactly one update call per unique session_id
    assert batch_service.update_session_totals.await_count == 2


@pytest.mark.asyncio
async def test_recompute_session_totals_batch_empty_list_is_a_noop():
    db = InMemoryDatabase()
    batch_service = AsyncMock()
    results = await recompute_session_totals_batch(db, [], lifecycle_service=batch_service)
    assert results == {}
    batch_service.update_session_totals.assert_not_awaited()
