"""Central metric names and emitters for operational signals."""

from __future__ import annotations

from typing import Any

from backend.services.observability import metrics as collector

PROJECTION_READINESS_STATUS = "projection_readiness_status"
PROJECTION_LAG_SECONDS = "projection_lag_seconds"
PROJECTION_DRIFT_COUNT = "projection_drift_count"
SYNC_FAILURE_RATE = "sync_failure_rate"
SESSION_DUPLICATE_ATTEMPTS = "session_duplicate_attempts"
SHADOW_TOTAL_REQUESTS = "shadow_total_requests"
SHADOW_MISMATCH_COUNT = "shadow_mismatch_count"
SHADOW_TIMEOUT_COUNT = "shadow_timeout_count"
SHADOW_ERROR_COUNT = "shadow_error_count"


async def record_projection_readiness(status: Any) -> None:
    await collector.set_gauge(
        PROJECTION_READINESS_STATUS,
        1.0 if bool(getattr(status, "ready", False)) else 0.0,
    )
    await collector.set_gauge(
        PROJECTION_LAG_SECONDS,
        float(getattr(status, "lag_seconds", 0.0) or 0.0),
    )


async def increment_projection_drift_count(value: int = 1) -> None:
    await collector.increment(PROJECTION_DRIFT_COUNT, max(int(value or 1), 1))


async def record_sync_failures(failed_count: int) -> None:
    if failed_count > 0:
        await collector.increment(SYNC_FAILURE_RATE, failed_count)


async def increment_session_duplicate_attempts() -> None:
    await collector.increment(SESSION_DUPLICATE_ATTEMPTS)


async def increment_shadow_total_requests(endpoint: str) -> None:
    await collector.increment(SHADOW_TOTAL_REQUESTS, labels={"endpoint": endpoint})


async def increment_shadow_mismatch_count(endpoint: str) -> None:
    await collector.increment(SHADOW_MISMATCH_COUNT, labels={"endpoint": endpoint})


async def increment_shadow_timeout_count(endpoint: str) -> None:
    await collector.increment(SHADOW_TIMEOUT_COUNT, labels={"endpoint": endpoint})


async def increment_shadow_error_count(endpoint: str) -> None:
    await collector.increment(SHADOW_ERROR_COUNT, labels={"endpoint": endpoint})
