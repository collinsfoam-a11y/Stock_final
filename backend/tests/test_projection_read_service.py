from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from backend.services.advanced_report_service import (
    AdvancedReportService,
    ReportConfig,
    ReportFilters,
    ReportSummary,
)
from backend.services.projection_read_service import ProjectionReadService
from backend.services.projection_readiness_gate import (
    ProjectionDriftMonitor,
    ProjectionGateCache,
    ProjectionReadinessGate,
    ProjectionReadinessReason,
    get_projection_gate_cache,
)
from backend.services.projection_status_store import (
    ProjectionGateStatus,
    ProjectionStatusUnavailable,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase


class _FakeStatusStore:
    def __init__(self, status: ProjectionGateStatus) -> None:
        self.status = status
        self.calls = 0

    async def read_status(self) -> ProjectionGateStatus:
        self.calls += 1
        return self.status


class _UnavailableStatusStore:
    async def read_status(self) -> ProjectionGateStatus:
        raise ProjectionStatusUnavailable("boom")


@pytest.mark.asyncio
async def test_projection_verified_items_report_uses_projection_rows():
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await db["verified_items_projection"].insert_one(
        {
            "id": "line-1",
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "item_name": "Item 1",
            "warehouse": "Main",
            "floor": "F1",
            "rack_id": "R1",
            "erp_qty": 5,
            "counted_qty": 7,
            "variance": 2,
            "mrp_erp": 10,
            "verified": True,
            "status": "locked",
            "counted_at": now,
        }
    )

    config = ReportConfig(
        report_type="verified_items",
        filters=ReportFilters(warehouse="Main"),
        include_aggregations=True,
    )
    service = ProjectionReadService(db)

    result = await service.generate_verified_items_report(
        config,
        columns=AdvancedReportService.REPORT_COLUMNS["verified_items"],
        summary_model=ReportSummary,
    )

    assert result["success"] is True
    assert result["data"][0]["item_code"] == "ITEM-1"
    assert result["data"][0]["variance"] == 2
    assert result["summary"]["aggregations"]["verified_count"] == 1


@pytest.mark.asyncio
async def test_projection_read_service_fails_when_required_collection_missing():
    db = InMemoryDatabase()
    service = ProjectionReadService(db)

    with pytest.raises(HTTPException) as exc:
        await service.get_item_details("missing-line")

    assert exc.value.status_code == 404


async def _seed_projection_readiness(
    db: InMemoryDatabase,
    *,
    is_consistent: bool = True,
    healthy_since: datetime | None = None,
    drift_count: int = 0,
) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for collection_name in (
        ProjectionReadService.SESSION_COLLECTION,
        ProjectionReadService.VERIFIED_COLLECTION,
        ProjectionReadService.VARIANCE_COLLECTION,
        ProjectionReadService.FINANCIAL_COLLECTION,
        ProjectionReadService.BATCH_COLLECTION,
    ):
        db[collection_name]

    await db["projection_readiness"].insert_one(
        {
            "_id": "current",
            "is_consistent": is_consistent,
            "projection_gap_count": 0,
            "projection_drift_count": drift_count,
            "projection_lag_seconds": 0,
            "updated_at": now,
            "healthy_since": healthy_since or now - timedelta(minutes=5),
        }
    )


@pytest.mark.asyncio
async def test_projection_gate_fails_closed_when_status_missing():
    db = InMemoryDatabase()
    for collection_name in (
        ProjectionReadService.SESSION_COLLECTION,
        ProjectionReadService.VERIFIED_COLLECTION,
        ProjectionReadService.VARIANCE_COLLECTION,
        ProjectionReadService.FINANCIAL_COLLECTION,
        ProjectionReadService.BATCH_COLLECTION,
    ):
        db[collection_name]

    service = ProjectionReadService(db, enforce_readiness=True)

    with pytest.raises(HTTPException) as exc:
        await service.get_dashboard_stats()

    assert exc.value.status_code == 503
    assert exc.value.detail["code"] == "PROJECTION_NOT_READY"
    assert exc.value.detail["reason"] == ProjectionReadinessReason.PARITY_FAILED.value


@pytest.mark.asyncio
async def test_projection_gate_reads_only_from_status_store():
    status = ProjectionGateStatus(
        ready=True,
        raw_ready=True,
        reason=None,
        message="ready",
        retry_after_seconds=0,
        checked_at=datetime.now(timezone.utc).replace(tzinfo=None),
        healthy_since=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5),
    )
    store = _FakeStatusStore(status)
    gate = ProjectionReadinessGate(store)  # type: ignore[arg-type]

    result = await gate.evaluate()

    assert result is status
    assert store.calls == 1
    assert not hasattr(gate, "db")


@pytest.mark.asyncio
async def test_projection_gate_status_store_failure_fails_closed():
    gate = ProjectionReadinessGate(_UnavailableStatusStore())  # type: ignore[arg-type]
    cache = ProjectionGateCache(gate)

    status = await cache.get_status(force_refresh=True)

    assert status.ready is False
    assert status.reason == ProjectionReadinessReason.PARITY_FAILED
    assert status.http_detail()["code"] == "PROJECTION_NOT_READY"


@pytest.mark.asyncio
async def test_projection_gate_allows_reads_after_stability_window():
    db = InMemoryDatabase()
    await _seed_projection_readiness(
        db,
        healthy_since=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5),
    )
    await db["verified_items_projection"].insert_one(
        {
            "id": "line-ready",
            "item_code": "READY",
            "counted_qty": 1,
            "variance": 0,
            "verified": True,
            "counted_at": datetime.now(timezone.utc).replace(tzinfo=None),
        }
    )

    result = await ProjectionReadService(db, enforce_readiness=True).get_dashboard_stats()

    assert result["success"] is True
    assert result["stats"]["total_items"] == 1


@pytest.mark.asyncio
async def test_projection_gate_blocks_during_stability_window():
    db = InMemoryDatabase()
    await _seed_projection_readiness(
        db,
        healthy_since=datetime.now(timezone.utc).replace(tzinfo=None),
    )

    with pytest.raises(HTTPException) as exc:
        await ProjectionReadService(db, enforce_readiness=True).get_dashboard_stats()

    assert exc.value.status_code == 503
    assert exc.value.detail["reason"] == ProjectionReadinessReason.STALE_DATA.value
    assert exc.value.detail["retry_after_seconds"] > 0


@pytest.mark.asyncio
async def test_projection_drift_monitor_marks_gate_unhealthy_with_cooldown():
    db = InMemoryDatabase()
    await _seed_projection_readiness(db, is_consistent=False, drift_count=1)
    cache = get_projection_gate_cache(db)

    status = await ProjectionDriftMonitor(cache).evaluate_once()

    assert status.ready is False
    assert status.reason == ProjectionReadinessReason.PARITY_FAILED
    assert status.retry_after_seconds > 0


@pytest.mark.asyncio
async def test_projection_verified_report_filters_before_pagination_and_sorts_mixed_dates():
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await db["verified_items_projection"].insert_one(
        {
            "id": "old-line",
            "item_code": "OLD",
            "counted_qty": 1,
            "variance": 0,
            "verified": True,
            "counted_at": "2024-01-01T00:00:00Z",
        }
    )
    await db["verified_items_projection"].insert_one(
        {
            "id": "new-line",
            "item_code": "NEW",
            "counted_qty": 1,
            "variance": 0,
            "verified": True,
            "counted_at": now,
        }
    )

    config = ReportConfig(
        report_type="verified_items",
        filters=ReportFilters(date_from=now.date()),
        page=1,
        page_size=1,
        sort_by="counted_at",
        include_aggregations=True,
    )

    result = await ProjectionReadService(db).generate_verified_items_report(
        config,
        columns=AdvancedReportService.REPORT_COLUMNS["verified_items"],
        summary_model=ReportSummary,
    )

    assert result["summary"]["filtered_records"] == 1
    assert result["data"][0]["item_code"] == "NEW"
