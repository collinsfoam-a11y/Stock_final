"""Central metric names and emitters for operational signals."""

from __future__ import annotations

from typing import Any

from backend.services.observability import metrics as collector

PROJECTION_READINESS_STATUS = "projection_readiness_status"
PROJECTION_LAG_SECONDS = "projection_lag_seconds"
PROJECTION_FRESHNESS_LAG = "projection_freshness_lag"
PROJECTION_DRIFT_COUNT = "projection_drift_count"
PROJECTION_GAP_COUNT = "projection_gap_count"
SYNC_FAILURE_RATE = "sync_failure_rate"
SYNC_QUEUE_SIZE = "sync_queue_size"
RETRY_COUNT = "retry_count"
RETRY_COUNT_DISTRIBUTION = "retry_count_distribution"
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
    await collector.set_gauge(
        PROJECTION_FRESHNESS_LAG,
        float(getattr(status, "freshness_lag_seconds", 0.0) or 0.0),
    )
    await collector.set_gauge(
        PROJECTION_DRIFT_COUNT,
        float(getattr(status, "drift_count", 0) or 0),
    )
    await collector.set_gauge(
        PROJECTION_GAP_COUNT,
        float(getattr(status, "gap_count", 0) or 0),
    )


async def increment_projection_drift_count(value: int = 1) -> None:
    await collector.increment(PROJECTION_DRIFT_COUNT, max(int(value or 1), 1))


async def record_sync_failures(failed_count: int) -> None:
    if failed_count > 0:
        await collector.increment(SYNC_FAILURE_RATE, failed_count)


async def record_sync_queue_size(queue_size: int) -> None:
    await collector.set_gauge(SYNC_QUEUE_SIZE, float(max(int(queue_size or 0), 0)))


async def record_retry_count(value: int) -> None:
    normalized = max(int(value or 0), 0)
    if normalized <= 0:
        return
    await collector.increment(RETRY_COUNT, normalized)
    await collector.observe(RETRY_COUNT_DISTRIBUTION, float(normalized))


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
