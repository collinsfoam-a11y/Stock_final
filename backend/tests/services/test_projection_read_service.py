from __future__ import annotations

from datetime import datetime, timezone

import pytest

from backend.services.observability import metrics
from backend.services.projection_read_service import ProjectionReadService
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.fixture(autouse=True)
def reset_projection_metrics():
    metrics._counters.clear()
    metrics._gauges.clear()
    metrics._histograms.clear()
    yield
    metrics._counters.clear()
    metrics._gauges.clear()
    metrics._histograms.clear()


@pytest.mark.asyncio
async def test_projection_read_service_builds_session_analytics_payload():
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.session_dashboard_projection.insert_many(
        [
            {
                "session_id": "sess-1",
                "status": "OPEN",
                "warehouse": "WH-A",
                "staff_name": "Sarah",
                "started_at": now,
                "total_items": 5,
                "total_variance": 120.0,
            },
            {
                "session_id": "sess-2",
                "status": "CLOSED",
                "warehouse": "WH-B",
                "staff_name": "Marcus",
                "started_at": now,
                "total_items": 3,
                "total_variance": -30.0,
            },
        ]
    )

    service = ProjectionReadService(db)
    payload = await service.get_sessions_analytics()

    assert payload["total_sessions"] == 2
    assert payload["overall"]["total_items"] == 8
    assert payload["overall"]["total_variance"] == 90.0
    assert payload["overall"]["positive_variance"] == 120.0
    assert payload["overall"]["negative_variance"] == -30.0
    assert payload["overall"]["avg_variance"] == 45.0
    assert payload["overall"]["sessions_by_status"] == [
        {"status": "CLOSED", "count": 1},
        {"status": "OPEN", "count": 1},
    ]
    assert payload["variance_by_warehouse"] == {"WH-A": 120.0, "WH-B": 30.0}
    assert payload["items_by_staff"] == {"Marcus": 3, "Sarah": 5}


@pytest.mark.asyncio
async def test_projection_validation_report_detects_projection_drift():
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.sessions.insert_one({"id": "sess-1", "started_at": now})
    await db.count_lines.insert_one(
        {
            "id": "line-1",
            "session_id": "sess-1",
            "counted_qty": 2.0,
            "variance": 1.0,
            "mrp_erp": 10.0,
            "status": "pending",
        }
    )

    await db.session_dashboard_projection.insert_one({"session_id": "sess-1"})
    await db.verified_items_projection.insert_one(
        {
            "count_line_id": "line-1",
            "session_id": "sess-1",
            "variance": 0.0,
            "status": "pending",
        }
    )
    await db.variance_summary_projection.insert_one(
        {
            "count_line_id": "line-1",
            "session_id": "sess-1",
            "variance": 0.0,
        }
    )
    await db.financial_projection.insert_one(
        {
            "session_id": "sess-1",
            "total_counted_value": 0.0,
        }
    )

    service = ProjectionReadService(db)
    report = await service.build_projection_validation_report()

    assert report["summary"]["is_consistent"] is False
    assert report["summary"]["drift_count"] == 2
    assert {mismatch["scope"] for mismatch in report["mismatches"]} == {
        "variance_totals",
        "financial_totals",
    }
