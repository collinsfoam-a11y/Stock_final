from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from backend.services import metrics as app_metrics
from backend.services.dependency_manager import DependencyManager
from backend.services.observability import metrics as collector
from backend.services.sql_health import check_sql_server_connection_status
from backend.utils.request_context import get_request_id


def test_get_request_id_uses_header_or_generates_uuid():
    assert get_request_id({"X-Request-ID": "req-123"}) == "req-123"
    assert get_request_id({"X-Request-ID": "req\nbad<>value"}) == "reqbadvalue"

    generated = get_request_id({})

    assert generated
    assert generated != "req-123"


def test_agent_ci_always_runs_projection_gate():
    script = Path("scripts/agent_ci.sh").read_text(encoding="utf-8")

    assert "PROJECTION_CI_GATE_ENABLED" not in script
    assert "check_projection_ci_gate.py" in script
    assert "run_projection_gate" in script


def test_projection_queries_are_bounded():
    source = Path("backend/services/projection_read_service.py").read_text(
        encoding="utf-8"
    )

    assert "to_list(None)" not in source
    assert ".limit(limit)" in source


@pytest.mark.asyncio
async def test_operational_metrics_emitters_publish_expected_names():
    await app_metrics.record_projection_readiness(
        SimpleNamespace(ready=True, lag_seconds=7, freshness_lag_seconds=2.5)
    )
    before = await collector.get_metrics()
    drift_before = before["counters"].get(app_metrics.PROJECTION_DRIFT_COUNT, 0)
    sync_before = before["counters"].get(app_metrics.SYNC_FAILURE_RATE, 0)
    retry_before = before["counters"].get(app_metrics.RETRY_COUNT, 0)
    duplicate_before = before["counters"].get(
        app_metrics.SESSION_DUPLICATE_ATTEMPTS, 0
    )

    await app_metrics.increment_projection_drift_count(2)
    await app_metrics.record_sync_failures(3)
    await app_metrics.record_retry_count(4)
    await app_metrics.record_sync_queue_size(9)
    await app_metrics.increment_session_duplicate_attempts()

    after = await collector.get_metrics()

    assert after["gauges"][app_metrics.PROJECTION_READINESS_STATUS] == 1.0
    assert after["gauges"][app_metrics.PROJECTION_LAG_SECONDS] == 7.0
    assert after["gauges"][app_metrics.PROJECTION_FRESHNESS_LAG] == 2.5
    assert after["gauges"][app_metrics.PROJECTION_DRIFT_COUNT] == 0.0
    assert after["gauges"][app_metrics.PROJECTION_GAP_COUNT] == 0.0
    assert after["gauges"][app_metrics.SYNC_QUEUE_SIZE] == 9.0
    assert after["counters"][app_metrics.PROJECTION_DRIFT_COUNT] == drift_before + 2
    assert after["counters"][app_metrics.SYNC_FAILURE_RATE] == sync_before + 3
    assert after["counters"][app_metrics.RETRY_COUNT] == retry_before + 4
    retry_hist = after["histograms"][app_metrics.RETRY_COUNT_DISTRIBUTION]
    assert retry_hist["count"] >= 1
    assert retry_hist["sum"] >= 4
    assert (
        after["counters"][app_metrics.SESSION_DUPLICATE_ATTEMPTS]
        == duplicate_before + 1
    )


@pytest.mark.asyncio
async def test_sql_health_without_pyodbc_returns_controlled_status(monkeypatch):
    monkeypatch.setattr(DependencyManager, "has_sql", staticmethod(lambda: False))

    assert await check_sql_server_connection_status() == "unavailable"
