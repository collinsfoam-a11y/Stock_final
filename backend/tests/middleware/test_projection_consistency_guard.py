from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI
import pytest

from backend.middleware.projection_consistency_guard import ProjectionConsistencyGuardMiddleware


def _reset_guard_state() -> None:
    ProjectionConsistencyGuardMiddleware._guard_checks_count = 0
    ProjectionConsistencyGuardMiddleware._guard_trigger_count = 0
    ProjectionConsistencyGuardMiddleware._guard_repair_count = 0
    ProjectionConsistencyGuardMiddleware._repair_wait_count = 0
    ProjectionConsistencyGuardMiddleware._visibility_samples_ms.clear()
    ProjectionConsistencyGuardMiddleware._outcome_window.clear()
    ProjectionConsistencyGuardMiddleware._circuit_open_until_ts = 0.0
    ProjectionConsistencyGuardMiddleware._last_visibility_summary_ts = 0.0


def test_percentile_helper() -> None:
    assert ProjectionConsistencyGuardMiddleware._percentile([], 95.0) == 0
    assert ProjectionConsistencyGuardMiddleware._percentile([10], 95.0) == 10
    assert ProjectionConsistencyGuardMiddleware._percentile([10, 20, 30, 40, 50], 95.0) == 50
    assert ProjectionConsistencyGuardMiddleware._percentile([10, 20, 30, 40, 50], 50.0) == 30


def test_projection_guard_circuit_trips(monkeypatch) -> None:
    _reset_guard_state()
    monkeypatch.setenv("PROJECTION_GUARD_CIRCUIT_ENABLED", "true")
    monkeypatch.setenv("PROJECTION_GUARD_CIRCUIT_MIN_SAMPLES", "3")
    monkeypatch.setenv("PROJECTION_GUARD_CIRCUIT_FAILURE_THRESHOLD_PCT", "50")
    monkeypatch.setenv("PROJECTION_GUARD_CIRCUIT_OPEN_SECONDS", "5")
    middleware = ProjectionConsistencyGuardMiddleware(FastAPI())

    middleware._record_outcome(False)
    middleware._record_outcome(True)
    middleware._record_outcome(True)

    assert ProjectionConsistencyGuardMiddleware._circuit_open_until_ts > time.time()
    assert middleware._is_circuit_open()


def test_circuit_open_response_shape(monkeypatch) -> None:
    _reset_guard_state()
    monkeypatch.setenv("PROJECTION_GUARD_CIRCUIT_ENABLED", "true")
    middleware = ProjectionConsistencyGuardMiddleware(FastAPI())

    response = middleware._build_circuit_open_response("/api/dashboard/stats")
    payload = response.body.decode("utf-8")

    assert response.status_code == 503
    assert "PROJECTION_INCONSISTENT" in payload
    assert "CIRCUIT_OPEN" in payload


def test_projection_guard_rejects_invalid_repair_script_names() -> None:
    middleware = ProjectionConsistencyGuardMiddleware(FastAPI())

    with pytest.raises(ValueError, match="Invalid projection repair script name"):
        middleware._resolve_script_command("../backfill")

    with pytest.raises(ValueError, match="Invalid projection repair script name"):
        middleware._resolve_script_command("backfill;rm")


def test_projection_guard_repair_cycle_validates_commands(monkeypatch) -> None:
    middleware = ProjectionConsistencyGuardMiddleware(FastAPI())
    calls: list[tuple[list[str], dict[str, Any]]] = []

    class _Result:
        returncode = 0
        stdout = ""
        stderr = ""

    def _fake_run(cmd: list[str], **kwargs: Any) -> _Result:
        calls.append((cmd, kwargs))
        return _Result()

    monkeypatch.setattr(
        "backend.middleware.projection_consistency_guard.subprocess.run",
        _fake_run,
    )

    middleware._run_projection_repair_cycle()

    scripts_dir = (middleware.root / "backend" / "scripts").resolve()
    assert len(calls) == 3
    for cmd, kwargs in calls:
        assert Path(cmd[0]).resolve() == Path(sys.executable).resolve()
        assert Path(cmd[1]).resolve().is_relative_to(scripts_dir)
        assert kwargs["shell"] is False
