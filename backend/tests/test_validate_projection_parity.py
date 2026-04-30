from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from backend.scripts.validate_projection_parity import (
    ProjectionParityConfig,
    validate_projection_parity,
    write_report,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.mark.asyncio
async def test_validate_projection_parity_passes_for_matching_projection_state(tmp_path):
    db = InMemoryDatabase()
    now = _utc_now_naive()

    await db.sessions.insert_one(
        {
            "id": "sess-1",
            "session_id": "sess-1",
            "status": "ACTIVE",
            "started_at": now - timedelta(minutes=5),
        }
    )
    await db.count_lines.insert_one(
        {
            "id": "line-1",
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 6.0,
            "variance": 1.0,
            "financial_impact": 15.0,
            "status": "approved",
            "approval_status": "APPROVED",
            "batch_no": "BATCH-1",
            "updated_at": now - timedelta(seconds=2),
        }
    )
    await db.count_lines.insert_one(
        {
            "id": "line-2",
            "session_id": "sess-1",
            "item_code": "ITEM-2",
            "counted_qty": 4.0,
            "variance": -1.0,
            "financial_impact": -15.0,
            "status": "pending",
            "approval_status": "NEEDS_REVIEW",
            "updated_at": now - timedelta(seconds=2),
        }
    )

    await db["session_dashboard_projection"].insert_one(
        {
            "session_id": "sess-1",
            "total_items": 2,
            "verified_items": 1,
            "pending_items": 1,
            "damage_items": 0,
            "total_variance": 0.0,
            "updated_at": now,
        }
    )
    await db["verified_items_projection"].insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 6.0,
            "variance": 1.0,
            "financial_impact": 15.0,
            "approval_status": "APPROVED",
            "verified": True,
            "batches": [{"batch": "BATCH-1", "qty": 6.0}],
            "updated_at": now,
        }
    )
    await db["verified_items_projection"].insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-2",
            "counted_qty": 4.0,
            "variance": -1.0,
            "financial_impact": -15.0,
            "approval_status": "NEEDS_REVIEW",
            "verified": False,
            "updated_at": now,
        }
    )
    await db["variance_summary_projection"].insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "variance": 1.0,
            "updated_at": now,
        }
    )
    await db["variance_summary_projection"].insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-2",
            "variance": -1.0,
            "updated_at": now,
        }
    )
    await db["financial_projection"].insert_one(
        {
            "session_id": "sess-1",
            "total_counted_value": 0.0,
            "total_stock_value": 0.0,
            "updated_at": now,
        }
    )
    await db["batch_records"].insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "batch_no": "BATCH-1",
            "counted_qty": 6.0,
            "updated_at": now,
        }
    )
    await db["batch_records"].insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-2",
            "batch_no": "NO_BATCH",
            "counted_qty": 4.0,
            "updated_at": now,
        }
    )
    await db["event_log"].insert_one({"timestamp": now - timedelta(seconds=1)})

    report = await validate_projection_parity(
        db,
        config=ProjectionParityConfig(
            output_path=tmp_path / "projection-parity-validation.json",
            sample_session_ids=("sess-1",),
        ),
    )

    assert report["is_consistent"] is True
    assert report["summary"] == {
        "session_totals_match": True,
        "verified_items_match": True,
        "variance_match": True,
        "financial_match": True,
        "sample_validation_passed": True,
        "event_lag_ok": True,
    }
    assert report["metrics"]["projection_drift_count"] == 0
    assert report["metrics"]["projection_gap_count"] == 0
    assert report["samples_checked"] == 1

    output_path = write_report(report, tmp_path / "reports" / "projection.json")
    assert output_path.exists() is True


@pytest.mark.asyncio
async def test_validate_projection_parity_fails_when_sample_projection_row_is_missing():
    db = InMemoryDatabase()
    now = _utc_now_naive()

    await db.sessions.insert_one(
        {
            "id": "sess-2",
            "session_id": "sess-2",
            "status": "ACTIVE",
            "started_at": now - timedelta(minutes=10),
        }
    )
    await db.count_lines.insert_one(
        {
            "id": "line-3",
            "session_id": "sess-2",
            "item_code": "ITEM-3",
            "counted_qty": 3.0,
            "variance": 2.0,
            "financial_impact": 20.0,
            "status": "approved",
            "approval_status": "APPROVED",
            "updated_at": now - timedelta(seconds=3),
        }
    )

    await db["session_dashboard_projection"].insert_one(
        {
            "session_id": "sess-2",
            "total_items": 1,
            "verified_items": 1,
            "pending_items": 0,
            "damage_items": 0,
            "total_variance": 2.0,
            "updated_at": now,
        }
    )
    db["verified_items_projection"]
    await db["variance_summary_projection"].insert_one(
        {
            "session_id": "sess-2",
            "item_code": "ITEM-3",
            "variance": 2.0,
            "updated_at": now,
        }
    )
    await db["financial_projection"].insert_one(
        {
            "session_id": "sess-2",
            "total_counted_value": 20.0,
            "total_stock_value": 0.0,
            "updated_at": now,
        }
    )
    db["batch_records"]
    await db["event_log"].insert_one({"timestamp": now - timedelta(seconds=1)})

    report = await validate_projection_parity(
        db,
        config=ProjectionParityConfig(sample_session_ids=("sess-2",)),
    )

    assert report["is_consistent"] is False
    assert report["summary"]["sample_validation_passed"] is False
    assert report["summary"]["verified_items_match"] is False
    assert report["metrics"]["projection_gap_count"] >= 1
    assert any(failure["check"] == "sample_item_row" for failure in report["failures"])


@pytest.mark.asyncio
async def test_validate_projection_parity_fails_when_event_lag_exceeds_threshold():
    db = InMemoryDatabase()
    now = _utc_now_naive()
    stale_projection_time = now - timedelta(seconds=20)

    await db.sessions.insert_one(
        {
            "id": "sess-3",
            "session_id": "sess-3",
            "status": "CLOSED",
            "started_at": now - timedelta(hours=1),
        }
    )
    await db.count_lines.insert_one(
        {
            "id": "line-4",
            "session_id": "sess-3",
            "item_code": "ITEM-4",
            "counted_qty": 5.0,
            "variance": 0.0,
            "financial_impact": 0.0,
            "status": "approved",
            "approval_status": "APPROVED",
            "updated_at": stale_projection_time,
        }
    )
    await db["session_dashboard_projection"].insert_one(
        {
            "session_id": "sess-3",
            "total_items": 1,
            "verified_items": 1,
            "pending_items": 0,
            "damage_items": 0,
            "total_variance": 0.0,
            "updated_at": stale_projection_time,
        }
    )
    await db["verified_items_projection"].insert_one(
        {
            "session_id": "sess-3",
            "item_code": "ITEM-4",
            "counted_qty": 5.0,
            "variance": 0.0,
            "financial_impact": 0.0,
            "approval_status": "APPROVED",
            "verified": True,
            "updated_at": stale_projection_time,
        }
    )
    await db["variance_summary_projection"].insert_one(
        {
            "session_id": "sess-3",
            "item_code": "ITEM-4",
            "variance": 0.0,
            "updated_at": stale_projection_time,
        }
    )
    await db["financial_projection"].insert_one(
        {
            "session_id": "sess-3",
            "total_counted_value": 0.0,
            "total_stock_value": 0.0,
            "updated_at": stale_projection_time,
        }
    )
    await db["batch_records"].insert_one(
        {
            "session_id": "sess-3",
            "item_code": "ITEM-4",
            "batch_no": "NO_BATCH",
            "counted_qty": 5.0,
            "updated_at": stale_projection_time,
        }
    )
    await db["event_log"].insert_one({"timestamp": now})

    report = await validate_projection_parity(
        db,
        config=ProjectionParityConfig(
            sample_session_ids=("sess-3",),
            event_lag_threshold_seconds=5.0,
        ),
    )

    assert report["is_consistent"] is False
    assert report["summary"]["event_lag_ok"] is False
    assert report["metrics"]["event_lag_seconds"] == 20.0
    assert any(failure["check"] == "event_lag" for failure in report["failures"])
