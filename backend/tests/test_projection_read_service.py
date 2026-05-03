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
from backend.services.projection_readiness_worker import ProjectionReadinessWorker
from backend.services.projection_snapshot import (
    reset_projection_snapshot_ts,
    set_projection_snapshot_ts,
)
from backend.services.projection_status_store import (
    ProjectionGateStatus,
    ProjectionStatusStore,
    ProjectionStatusUnavailable,
)
from backend.services.realtime_dashboard_service import RealtimeDashboardService
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


class _SequencedGateCache:
    def __init__(self, statuses: list[ProjectionGateStatus]) -> None:
        self._statuses = list(statuses)
        self.calls: list[bool] = []
        self.stability_window_seconds = 60
        self._last = statuses[-1] if statuses else None

    async def get_status(self, *, force_refresh: bool = False) -> ProjectionGateStatus:
        self.calls.append(force_refresh)
        if self._statuses:
            self._last = self._statuses.pop(0)
        if self._last is None:
            raise AssertionError("No statuses configured for _SequencedGateCache")
        return self._last


class _StaticAggregateCursor:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    async def to_list(self, _length: int) -> list[dict[str, object]]:
        return self.rows


class _StaticCountLinesCollection:
    def __init__(self, aggregate_result: dict[str, object]) -> None:
        self.aggregate_result = aggregate_result

    def aggregate(self, _pipeline: list[dict[str, object]]) -> _StaticAggregateCursor:
        return _StaticAggregateCursor([self.aggregate_result])


class _StaticDashboardDatabase:
    def __init__(self, aggregate_result: dict[str, object]) -> None:
        self.count_lines = _StaticCountLinesCollection(aggregate_result)


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
    stability_since: datetime | None = None,
    drift_count: int = 0,
) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    stable_at = stability_since or healthy_since or now - timedelta(minutes=5)
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
            "stability_since": stable_at,
            "healthy_since": stable_at,
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
    assert exc.value.detail["code"] == "PROJECTION_INCONSISTENT"
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
    assert status.http_detail()["code"] == "PROJECTION_INCONSISTENT"


@pytest.mark.asyncio
async def test_projection_gate_cache_uses_ttl_to_avoid_repeated_status_reads():
    status = ProjectionGateStatus(
        ready=False,
        raw_ready=False,
        reason=ProjectionReadinessReason.PARITY_FAILED,
        message="not ready",
        retry_after_seconds=30,
        checked_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    store = _FakeStatusStore(status)
    cache = ProjectionGateCache(ProjectionReadinessGate(store))  # type: ignore[arg-type]

    first = await cache.get_status()
    second = await cache.get_status()

    assert first is status
    assert second is status
    assert store.calls == 1


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
async def test_projection_readiness_retry_recovers_transient_stale_state(
    monkeypatch: pytest.MonkeyPatch,
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    stale_status = ProjectionGateStatus(
        ready=False,
        raw_ready=False,
        reason=ProjectionReadinessReason.STALE_DATA,
        message="Projection readiness status is stale.",
        retry_after_seconds=1,
        checked_at=now,
        stability_since=now - timedelta(seconds=59),
        lag_seconds=0.05,
        freshness_lag_seconds=301.0,
    )
    ready_status = ProjectionGateStatus(
        ready=True,
        raw_ready=True,
        reason=None,
        message="Projection readiness checks passed.",
        retry_after_seconds=0,
        checked_at=now + timedelta(milliseconds=80),
        stability_since=now - timedelta(minutes=5),
        lag_seconds=0.01,
        freshness_lag_seconds=1.0,
    )
    gate_cache = _SequencedGateCache([stale_status, ready_status])

    db = InMemoryDatabase()
    await db["verified_items_projection"].insert_one(
        {
            "id": "line-ready",
            "item_code": "READY",
            "counted_qty": 1,
            "variance": 0,
            "verified": True,
            "counted_at": now,
        }
    )

    sleep_calls: list[float] = []

    async def _fake_sleep(delay: float) -> None:
        sleep_calls.append(delay)

    monkeypatch.setenv("PROJECTION_READINESS_RETRY_ATTEMPTS", "2")
    monkeypatch.setenv("PROJECTION_READINESS_RETRY_DELAY_MS", "75")
    monkeypatch.setattr("backend.services.projection_read_service.asyncio.sleep", _fake_sleep)

    service = ProjectionReadService(db, enforce_readiness=True, gate_cache=gate_cache)  # type: ignore[arg-type]
    result = await service.get_dashboard_stats()

    assert result["success"] is True
    assert result["stats"]["total_items"] == 1
    assert gate_cache.calls == [False, True]
    assert sleep_calls == [pytest.approx(0.075, rel=0.0, abs=1e-6)]


@pytest.mark.asyncio
async def test_projection_readiness_retry_stays_bounded_and_raises_after_max_attempts(
    monkeypatch: pytest.MonkeyPatch,
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    stale_status = ProjectionGateStatus(
        ready=False,
        raw_ready=False,
        reason=ProjectionReadinessReason.STALE_DATA,
        message="Projection readiness status is stale.",
        retry_after_seconds=1,
        checked_at=now,
        stability_since=now - timedelta(seconds=59),
        lag_seconds=0.05,
        freshness_lag_seconds=301.0,
    )
    gate_cache = _SequencedGateCache([stale_status, stale_status, stale_status])

    db = InMemoryDatabase()
    await db["verified_items_projection"].insert_one(
        {
            "id": "line-ready",
            "item_code": "READY",
            "counted_qty": 1,
            "variance": 0,
            "verified": True,
            "counted_at": now,
        }
    )

    sleep_calls: list[float] = []

    async def _fake_sleep(delay: float) -> None:
        sleep_calls.append(delay)

    monkeypatch.setenv("PROJECTION_READINESS_RETRY_ATTEMPTS", "2")
    monkeypatch.setenv("PROJECTION_READINESS_RETRY_DELAY_MS", "75")
    monkeypatch.setattr("backend.services.projection_read_service.asyncio.sleep", _fake_sleep)

    service = ProjectionReadService(db, enforce_readiness=True, gate_cache=gate_cache)  # type: ignore[arg-type]
    with pytest.raises(HTTPException) as exc:
        await service.get_dashboard_stats()

    assert exc.value.status_code == 503
    assert exc.value.detail["code"] == "PROJECTION_INCONSISTENT"
    assert gate_cache.calls == [False, True, True]
    assert sleep_calls == [
        pytest.approx(0.075, rel=0.0, abs=1e-6),
        pytest.approx(0.075, rel=0.0, abs=1e-6),
    ]


@pytest.mark.asyncio
async def test_projection_validation_mode_blocks_when_session_projection_count_lags(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("VALIDATION_MODE", "true")
    monkeypatch.setenv("PROJECTION_VALIDATION_FRESHNESS_RETRIES", "1")
    monkeypatch.setenv("PROJECTION_VALIDATION_FRESHNESS_RETRY_DELAY_SECONDS", "0")
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await _seed_projection_readiness(
        db,
        healthy_since=now - timedelta(minutes=5),
    )
    await db["sessions"].insert_one(
        {"session_id": "sess-new", "updated_at": now, "status": "OPEN"}
    )
    await db["verified_items_projection"].insert_one(
        {
            "id": "line-ready",
            "item_code": "READY",
            "counted_qty": 1,
            "variance": 0,
            "verified": True,
            "counted_at": now,
        }
    )

    with pytest.raises(HTTPException) as exc:
        await ProjectionReadService(db, enforce_readiness=True).get_dashboard_stats()

    assert exc.value.status_code == 503
    assert exc.value.detail["code"] == "PROJECTION_INCONSISTENT"
    assert exc.value.detail["reason"] == ProjectionReadinessReason.STALE_DATA.value
    assert exc.value.detail["metrics"]["legacy_session_count"] == 1
    assert exc.value.detail["metrics"]["projection_session_count"] == 0


@pytest.mark.asyncio
async def test_projection_validation_mode_blocks_when_session_projection_timestamp_lags(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("VALIDATION_MODE", "true")
    monkeypatch.setenv("PROJECTION_MAX_LAG_SECONDS", "2")
    monkeypatch.setenv("PROJECTION_VALIDATION_FRESHNESS_RETRIES", "1")
    monkeypatch.setenv("PROJECTION_VALIDATION_FRESHNESS_RETRY_DELAY_SECONDS", "0")
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await _seed_projection_readiness(
        db,
        healthy_since=now - timedelta(minutes=5),
    )
    await db["sessions"].insert_one(
        {"session_id": "sess-new", "updated_at": now, "status": "OPEN"}
    )
    await db["session_dashboard_projection"].insert_one(
        {
            "session_id": "sess-new",
            "status": "OPEN",
            "last_activity": now - timedelta(seconds=5),
        }
    )
    await db["verified_items_projection"].insert_one(
        {
            "id": "line-ready",
            "item_code": "READY",
            "counted_qty": 1,
            "variance": 0,
            "verified": True,
            "counted_at": now,
        }
    )

    with pytest.raises(HTTPException) as exc:
        await ProjectionReadService(db, enforce_readiness=True).get_dashboard_stats()

    assert exc.value.status_code == 503
    metrics = exc.value.detail["metrics"]
    assert metrics["legacy_session_count"] == 1
    assert metrics["projection_session_count"] == 1
    assert metrics["latest_legacy_session_ts"] == now.isoformat()
    assert metrics["latest_projection_session_ts"] == (
        now - timedelta(seconds=5)
    ).isoformat()


@pytest.mark.asyncio
async def test_projection_validation_mode_allows_when_projection_lag_is_within_threshold(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("VALIDATION_MODE", "true")
    monkeypatch.setenv("PROJECTION_MAX_LAG_SECONDS", "5")
    monkeypatch.setenv("PROJECTION_VALIDATION_FRESHNESS_RETRIES", "1")
    monkeypatch.setenv("PROJECTION_VALIDATION_FRESHNESS_RETRY_DELAY_SECONDS", "0")
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await _seed_projection_readiness(
        db,
        healthy_since=now - timedelta(minutes=5),
    )
    await db["sessions"].insert_one(
        {"session_id": "sess-lag-ok", "updated_at": now, "status": "OPEN"}
    )
    await db["session_dashboard_projection"].insert_one(
        {
            "session_id": "sess-lag-ok",
            "status": "OPEN",
            "last_activity": now - timedelta(seconds=2),
        }
    )
    await db["verified_items_projection"].insert_one(
        {
            "id": "line-ready",
            "item_code": "READY",
            "counted_qty": 1,
            "variance": 0,
            "verified": True,
            "counted_at": now,
        }
    )

    result = await ProjectionReadService(db, enforce_readiness=True).get_dashboard_stats()

    assert result["success"] is True
    assert result["stats"]["total_items"] == 1


@pytest.mark.asyncio
async def test_projection_validation_mode_allows_when_session_projection_is_fresh(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("VALIDATION_MODE", "true")
    monkeypatch.setenv("PROJECTION_VALIDATION_FRESHNESS_RETRIES", "1")
    monkeypatch.setenv("PROJECTION_VALIDATION_FRESHNESS_RETRY_DELAY_SECONDS", "0")
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await _seed_projection_readiness(
        db,
        healthy_since=now - timedelta(minutes=5),
    )
    await db["sessions"].insert_one(
        {"session_id": "sess-ready", "updated_at": now, "status": "OPEN"}
    )
    await db["session_dashboard_projection"].insert_one(
        {
            "session_id": "sess-ready",
            "status": "OPEN",
            "last_activity": now,
        }
    )
    await db["verified_items_projection"].insert_one(
        {
            "id": "line-ready",
            "item_code": "READY",
            "counted_qty": 1,
            "variance": 0,
            "verified": True,
            "counted_at": now,
        }
    )

    result = await ProjectionReadService(db, enforce_readiness=True).get_dashboard_stats()

    assert result["success"] is True
    assert result["stats"]["total_items"] == 1


@pytest.mark.asyncio
async def test_projection_validation_snapshot_ignores_post_snapshot_session_lag(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("VALIDATION_MODE", "true")
    monkeypatch.setenv("PROJECTION_VALIDATION_FRESHNESS_RETRIES", "1")
    monkeypatch.setenv("PROJECTION_VALIDATION_FRESHNESS_RETRY_DELAY_SECONDS", "0")
    db = InMemoryDatabase()
    snapshot_ts = datetime.now(timezone.utc).replace(tzinfo=None)
    later = snapshot_ts + timedelta(seconds=5)
    await _seed_projection_readiness(
        db,
        healthy_since=snapshot_ts - timedelta(minutes=5),
    )
    await db["sessions"].insert_many(
        [
            {"session_id": "sess-ready", "updated_at": snapshot_ts, "status": "OPEN"},
            {"session_id": "sess-new", "updated_at": later, "status": "OPEN"},
        ]
    )
    await db["session_dashboard_projection"].insert_one(
        {
            "session_id": "sess-ready",
            "status": "OPEN",
            "last_activity": snapshot_ts,
        }
    )
    await db["verified_items_projection"].insert_one(
        {
            "id": "line-ready",
            "item_code": "READY",
            "counted_qty": 1,
            "variance": 0,
            "verified": True,
            "updated_at": snapshot_ts,
        }
    )
    token = set_projection_snapshot_ts(snapshot_ts)
    try:
        result = await ProjectionReadService(
            db,
            enforce_readiness=True,
        ).get_dashboard_stats()
    finally:
        reset_projection_snapshot_ts(token)

    assert result["success"] is True
    assert result["stats"]["total_items"] == 1


@pytest.mark.asyncio
async def test_projection_validation_uses_source_event_time_not_processing_time(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("VALIDATION_MODE", "true")
    monkeypatch.setenv("PROJECTION_VALIDATION_FRESHNESS_RETRIES", "1")
    monkeypatch.setenv("PROJECTION_VALIDATION_FRESHNESS_RETRY_DELAY_SECONDS", "0")
    db = InMemoryDatabase()
    snapshot_ts = datetime.now(timezone.utc).replace(tzinfo=None)
    processing_delay_ts = snapshot_ts + timedelta(minutes=2)
    await _seed_projection_readiness(
        db,
        healthy_since=snapshot_ts - timedelta(minutes=5),
    )
    await db["sessions"].insert_one(
        {"session_id": "sess-delayed", "updated_at": snapshot_ts, "status": "OPEN"}
    )
    await db["session_dashboard_projection"].insert_one(
        {
            "session_id": "sess-delayed",
            "status": "OPEN",
            "source_updated_at": snapshot_ts,
            "session_updated_at": snapshot_ts,
            "updated_at": processing_delay_ts,
        }
    )
    await db["verified_items_projection"].insert_one(
        {
            "id": "line-delayed",
            "session_id": "sess-delayed",
            "item_code": "DELAYED",
            "counted_qty": 1,
            "variance": 0,
            "verified": True,
            "source_updated_at": snapshot_ts,
            "session_updated_at": snapshot_ts,
            "updated_at": processing_delay_ts,
        }
    )
    token = set_projection_snapshot_ts(snapshot_ts)
    try:
        result = await ProjectionReadService(
            db,
            enforce_readiness=True,
        ).get_dashboard_stats()
    finally:
        reset_projection_snapshot_ts(token)

    assert result["success"] is True
    assert result["stats"]["total_items"] == 1


@pytest.mark.asyncio
async def test_projection_snapshot_filters_rows_after_snapshot():
    db = InMemoryDatabase()
    snapshot_ts = datetime.now(timezone.utc).replace(tzinfo=None)
    await db["verified_items_projection"].insert_many(
        [
            {
                "id": "line-ready",
                "item_code": "READY",
                "counted_qty": 1,
                "variance": 0,
                "verified": True,
                "counted_at": snapshot_ts,
            },
            {
                "id": "line-later",
                "item_code": "LATER",
                "counted_qty": 1,
                "variance": 0,
                "verified": True,
                "counted_at": snapshot_ts + timedelta(seconds=5),
            },
        ]
    )
    token = set_projection_snapshot_ts(snapshot_ts)
    try:
        result = await ProjectionReadService(db).get_dashboard_stats()
    finally:
        reset_projection_snapshot_ts(token)

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
async def test_projection_gate_uses_stability_since_field():
    db = InMemoryDatabase()
    await _seed_projection_readiness(
        db,
        stability_since=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5),
    )
    await db["verified_items_projection"].insert_one(
        {
            "id": "line-stable",
            "item_code": "STABLE",
            "counted_qty": 1,
            "variance": 0,
            "verified": True,
            "counted_at": datetime.now(timezone.utc).replace(tzinfo=None),
        }
    )

    result = await ProjectionReadService(db, enforce_readiness=True).get_dashboard_stats()

    assert result["success"] is True


@pytest.mark.asyncio
async def test_projection_drift_monitor_marks_store_and_cache_unhealthy_with_cooldown():
    db = InMemoryDatabase()
    await _seed_projection_readiness(db, is_consistent=False, drift_count=1)
    cache = get_projection_gate_cache(db)

    status = await ProjectionDriftMonitor(cache).evaluate_once()
    persisted = await db["projection_readiness"].find_one({"_id": "current"})

    assert status.ready is False
    assert status.reason == ProjectionReadinessReason.DRIFT_DETECTED
    assert status.retry_after_seconds > 0
    assert persisted["is_ready"] is False
    assert persisted["reason"] == ProjectionReadinessReason.DRIFT_DETECTED.value


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


@pytest.mark.asyncio
async def test_projection_dashboard_stats_matches_legacy_count_line_semantics():
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await db["verified_items_projection"].insert_many(
        [
            {
                "id": "line-1",
                "item_code": "ITEM-1",
                "warehouse": "ERP Warehouse",
                "status": "locked",
                "verified": False,
                "variance": 3,
                "counted_at": now,
            },
            {
                "id": "line-2",
                "item_code": "ITEM-2",
                "source_warehouse": "Line Warehouse",
                "status": "pending",
                "verified": True,
                "variance": -1,
                "counted_at": now,
            },
        ]
    )

    result = await ProjectionReadService(db).get_dashboard_stats()

    assert result["stats"]["total_items"] == 2
    assert result["stats"]["verified_items"] == 1
    assert result["stats"]["pending_items"] == 1
    assert result["by_warehouse"] == [
        {"warehouse": "Unknown", "count": 1},
        {"warehouse": "Line Warehouse", "count": 1},
    ]
    assert result["by_status"] == [
        {"status": "locked", "count": 1},
        {"status": "pending", "count": 1},
    ]


@pytest.mark.asyncio
async def test_legacy_dashboard_stats_sorts_status_like_projection():
    db = _StaticDashboardDatabase(
        {
            "total": [{"count": 13}],
            "verified": [{"count": 4}],
            "pending": [{"count": 9}],
            "variance_stats": [{"total_variance": 0, "positive": 0, "negative": 0}],
            "today_activity": [{"count": 0}],
            "by_warehouse": [],
            "by_status": [
                {"_id": "pending", "count": 9},
                {"_id": "approved", "count": 4},
            ],
        }
    )

    result = await RealtimeDashboardService(db)._get_dashboard_stats_baseline()

    assert result["by_status"] == [
        {"status": "approved", "count": 4},
        {"status": "pending", "count": 9},
    ]


@pytest.mark.asyncio
async def test_projection_admin_kpis_match_legacy_aggregate_sources():
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await db["erp_items"].insert_many(
        [
            {"item_code": "ITEM-1", "stock_qty": 5, "price": 2},
            {"item_code": "ITEM-2", "stock_qty": 3, "price": 4},
        ]
    )
    await db["session_dashboard_projection"].insert_many(
        [
            {"session_id": "open", "status": "OPEN"},
            {"session_id": "closed", "status": "OPEN", "closed_at": now},
        ]
    )
    await db["verified_items_projection"].insert_many(
        [
            {
                "item_code": "ITEM-1",
                "status": "locked",
                "counted_qty": 2,
                "mrp_erp": 5,
                "finalized_at": now,
            },
            {"item_code": "ITEM-1", "status": "locked", "counted_qty": 1, "mrp": 7},
        ]
    )
    await db["variance_summary_projection"].insert_many(
        [
            {
                "item_code": "ITEM-1",
                "variance": 2,
                "approval_status": "NEEDS_REVIEW",
            },
            {"item_code": "ITEM-2", "variance": 1, "approval_status": "REJECTED"},
        ]
    )

    result = await ProjectionReadService(db).get_admin_kpis(active_users=4)

    assert result["total_stock_value"] == 22
    assert result["verified_stock_value"] == 17
    assert result["verification_percentage"] == 50
    assert result["active_sessions"] == 1
    assert result["active_users"] == 4
    assert result["pending_variances"] == 1
    assert result["items_verified_today"] == 1


@pytest.mark.asyncio
async def test_projection_stock_summary_includes_uncounted_erp_items():
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await db["erp_items"].insert_many(
        [
            {
                "item_code": "ITEM-1",
                "item_name": "Item 1",
                "category": "Cat",
                "warehouse": "Main",
                "floor": "F1",
                "stock_qty": 5,
                "price": 2,
            },
            {
                "item_code": "ITEM-2",
                "item_name": "Item 2",
                "category": "Cat",
                "warehouse": "Main",
                "floor": "F1",
                "stock_qty": 3,
                "price": 4,
            },
        ]
    )
    await db["verified_items_projection"].insert_one(
        {
            "item_code": "ITEM-1",
            "item_name": "Projection Item 1",
            "counted_qty": 2,
            "status": "locked",
            "counted_at": now,
            "finalized_at": now,
        }
    )

    result = await ProjectionReadService(db).generate_stock_summary(ReportFilters())

    assert [row["item_code"] for row in result] == ["ITEM-1", "ITEM-2"]
    assert result[0]["item_name"] == "Item 1"
    assert result[0]["verification_count"] == 1
    assert result[0]["finalized_count"] == 1
    assert result[0]["finalized_qty"] == 2
    assert result[0]["stock_value"] == 10
    assert result[1]["verification_count"] == 0


@pytest.mark.asyncio
async def test_projection_variance_report_uses_erp_metadata_and_legacy_sort():
    db = InMemoryDatabase()
    old = datetime(2026, 1, 1, tzinfo=timezone.utc).replace(tzinfo=None)
    new = datetime(2026, 4, 27, tzinfo=timezone.utc).replace(tzinfo=None)
    await db["erp_items"].insert_one(
        {"item_code": "ITEM-1", "item_name": "ERP Item", "warehouse": "Main"}
    )
    await db["variance_summary_projection"].insert_many(
        [
            {
                "item_code": "ITEM-1",
                "item_name": "Projection Item",
                "counted_qty": 10,
                "stock_qty": 0,
                "variance": 10,
                "status": "pending",
                "approval_status": "NEEDS_REVIEW",
                "counted_at": old,
                "warehouse": "Projection Warehouse",
            },
            {
                "item_code": "ITEM-1",
                "counted_qty": 1,
                "stock_qty": 0,
                "variance": 1,
                "status": "rejected",
                "approval_status": "REJECTED",
                "counted_at": new,
                "warehouse": "Projection Warehouse",
            },
        ]
    )

    result = await ProjectionReadService(db).generate_variance_report(ReportFilters())

    assert [row["counted_qty"] for row in result] == [10, 1]
    assert [row["variance_percentage"] for row in result] == [100.0, 100.0]
    assert {row["warehouse"] for row in result} == {"Main"}


@pytest.mark.asyncio
async def test_projection_session_history_matches_legacy_shape():
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await db["session_dashboard_projection"].insert_one(
        {
            "session_id": "sess-1",
            "staff_user": "staff1",
            "staff_name": "Staff One",
            "warehouse": "Main",
            "rack_no": "R1",
            "location_name": "F1",
            "status": "OPEN",
            "started_at": now,
            "total_items": 2,
            "verified_items": 1,
            "total_variance": 3,
        }
    )

    result = await ProjectionReadService(db).generate_session_history(ReportFilters())

    assert result == [
        {
            "session_id": "sess-1",
            "username": "staff1",
            "staff_name": "Staff One",
            "warehouse": "Main",
            "rack_id": "R1",
            "floor": "F1",
            "status": "OPEN",
            "finalization_status": None,
            "started_at": now,
            "completed_at": None,
            "duration_minutes": None,
            "items_scanned": 2,
            "items_verified": 1,
            "total_variance": 3.0,
            "finalized_by": None,
            "finalized_at": None,
        }
    ]
    assert "total_items" not in result[0]
    assert "verified_items" not in result[0]


@pytest.mark.asyncio
async def test_projection_status_store_refreshes_stale_ready_document():
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    stale = now - timedelta(minutes=20)
    await db["projection_readiness"].insert_one(
        {
            "_id": "current",
            "is_consistent": True,
            "is_ready": True,
            "ready": True,
            "parity_passed": True,
            "projection_drift_count": 0,
            "projection_gap_count": 0,
            "projection_lag_seconds": 0.0,
            "updated_at": stale,
            "validated_at": stale,
        }
    )

    store = ProjectionStatusStore(db)
    refreshed = await store.refresh_ready_status()
    assert refreshed is True

    status = await store.read_status()
    assert status.ready is True
    assert status.reason is None


@pytest.mark.asyncio
async def test_projection_status_store_refresh_skips_drifted_document():
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await db["projection_readiness"].insert_one(
        {
            "_id": "current",
            "is_consistent": True,
            "is_ready": False,
            "ready": False,
            "parity_passed": False,
            "projection_drift_count": 1,
            "projection_gap_count": 0,
            "projection_lag_seconds": 0.0,
            "reason": ProjectionReadinessReason.DRIFT_DETECTED.value,
            "updated_at": now,
        }
    )

    store = ProjectionStatusStore(db)
    refreshed = await store.refresh_ready_status()
    assert refreshed is False


@pytest.mark.asyncio
async def test_projection_status_store_refreshes_stale_document_when_ready_flags_are_false():
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    stale = now - timedelta(minutes=15)
    await db["projection_readiness"].insert_one(
        {
            "_id": "current",
            "is_consistent": True,
            "is_ready": False,
            "ready": False,
            "parity_passed": True,
            "projection_drift_count": 0,
            "projection_gap_count": 0,
            "projection_lag_seconds": 0.0,
            "reason": ProjectionReadinessReason.STALE_DATA.value,
            "updated_at": stale,
            "validated_at": stale,
        }
    )

    store = ProjectionStatusStore(db)
    refreshed = await store.refresh_ready_status()

    assert refreshed is True
    status = await store.read_status()
    assert status.ready is True
    assert status.reason is None


@pytest.mark.asyncio
async def test_projection_readiness_worker_auto_refreshes_stale_readiness():
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    stale = now - timedelta(minutes=20)
    await db["projection_readiness"].insert_one(
        {
            "_id": "current",
            "is_consistent": True,
            "is_ready": False,
            "ready": False,
            "parity_passed": True,
            "projection_drift_count": 0,
            "projection_gap_count": 0,
            "projection_lag_seconds": 0.0,
            "reason": ProjectionReadinessReason.STALE_DATA.value,
            "updated_at": stale,
            "validated_at": stale,
            "healthy_since": stale,
            "stability_since": stale,
        }
    )

    worker = ProjectionReadinessWorker(db, interval_seconds=5)
    await worker._tick()  # test the worker action directly

    status = await ProjectionStatusStore(db).read_status()
    assert status.ready is True
    assert status.reason is None


@pytest.mark.asyncio
async def test_projection_status_refresh_preserves_stability_window_markers():
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    original_mark = now - timedelta(minutes=9)
    stale = now - timedelta(minutes=20)
    await db["projection_readiness"].insert_one(
        {
            "_id": "current",
            "is_consistent": True,
            "is_ready": False,
            "ready": False,
            "parity_passed": True,
            "projection_drift_count": 0,
            "projection_gap_count": 0,
            "projection_lag_seconds": 0.0,
            "reason": ProjectionReadinessReason.STALE_DATA.value,
            "updated_at": stale,
            "validated_at": stale,
            "healthy_since": original_mark,
            "stability_since": original_mark,
        }
    )

    store = ProjectionStatusStore(db)
    refreshed = await store.refresh_ready_status()

    assert refreshed is True
    refreshed_doc = await db["projection_readiness"].find_one({"_id": "current"})
    assert refreshed_doc is not None
    assert refreshed_doc["healthy_since"] == original_mark
    assert refreshed_doc["stability_since"] == original_mark
