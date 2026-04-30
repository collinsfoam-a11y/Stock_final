"""Cached readiness controls for projection read cutover."""

from __future__ import annotations

import logging
import time
from dataclasses import replace
from datetime import datetime
from typing import Any, Optional

from fastapi import HTTPException

from backend.config import settings
from backend.services.observability import metrics
from backend.services.projection_status_store import (
    ProjectionGateStatus,
    ProjectionReadinessReason,
    ProjectionStatusStore,
    ProjectionStatusUnavailable,
    utc_now,
)

logger = logging.getLogger(__name__)


def _setting_int(name: str, default: int) -> int:
    try:
        return int(getattr(settings, name, default))
    except (TypeError, ValueError):
        return default


class ProjectionReadinessGate:
    """Pure readiness gate.

    The gate intentionally delegates all persisted readiness reads and parsing
    to ``ProjectionStatusStore``. It does not query projection collections,
    compute parity, check freshness, or check lag.
    """

    def __init__(self, status_store: ProjectionStatusStore) -> None:
        self.status_store = status_store

    async def evaluate(self) -> ProjectionGateStatus:
        return await self.status_store.read_status()


class ProjectionGateCache:
    """TTL cache and stability-window enforcer for projection readiness."""

    TTL_SECONDS = 30

    def __init__(self, gate: ProjectionReadinessGate) -> None:
        self.gate = gate
        self.ttl_seconds = _setting_int("PROJECTION_GATE_TTL_SECONDS", self.TTL_SECONDS)
        self.stability_window_seconds = _setting_int(
            "PROJECTION_STABILITY_WINDOW_SECONDS", 60
        )
        self.cooldown_seconds = _setting_int("PROJECTION_DRIFT_COOLDOWN_SECONDS", 300)
        self._cached_status: Optional[ProjectionGateStatus] = None
        self._expires_at = 0.0
        self._cooldown_until = 0.0
        self._unhealthy_since: Optional[datetime] = None

    async def get_status(self, *, force_refresh: bool = False) -> ProjectionGateStatus:
        now_monotonic = time.monotonic()
        if not force_refresh and self._cached_status and now_monotonic < self._expires_at:
            return self._cached_status

        if self._cooldown_until > now_monotonic:
            status = ProjectionGateStatus(
                ready=False,
                raw_ready=False,
                reason=ProjectionReadinessReason.PARITY_FAILED,
                message="Projection reads are in drift cooldown.",
                retry_after_seconds=max(int(self._cooldown_until - now_monotonic), 1),
                checked_at=utc_now(),
            )
            await self._publish_metrics(status)
            self._store(status)
            return status

        try:
            raw_status = await self.gate.evaluate()
        except ProjectionStatusUnavailable:
            raw_status = ProjectionGateStatus(
                ready=False,
                raw_ready=False,
                reason=ProjectionReadinessReason.PARITY_FAILED,
                message="Projection readiness status store is unavailable.",
                retry_after_seconds=_setting_int("PROJECTION_GATE_RETRY_AFTER_SECONDS", 30),
                checked_at=utc_now(),
            )
        status = self._apply_stability_window(raw_status)
        self._emit_alerts(status)
        await self._publish_metrics(status)
        self._store(status)
        return status

    async def require_ready(self) -> ProjectionGateStatus:
        status = await self.get_status()
        if status.ready:
            return status
        raise HTTPException(status_code=503, detail=status.http_detail())

    def mark_unhealthy(
        self,
        *,
        reason: ProjectionReadinessReason = ProjectionReadinessReason.PARITY_FAILED,
        message: str = "Projection drift detected.",
    ) -> ProjectionGateStatus:
        self._cooldown_until = time.monotonic() + self.cooldown_seconds
        status = ProjectionGateStatus(
            ready=False,
            raw_ready=False,
            reason=reason,
            message=message,
            retry_after_seconds=self.cooldown_seconds,
            checked_at=utc_now(),
            drift_count=1,
        )
        self._store(status)
        return status

    def invalidate(self) -> None:
        self._cached_status = None
        self._expires_at = 0.0

    def _apply_stability_window(self, raw_status: ProjectionGateStatus) -> ProjectionGateStatus:
        if not raw_status.raw_ready:
            return raw_status

        healthy_since = raw_status.healthy_since
        if healthy_since is None and self._cached_status and self._cached_status.raw_ready:
            healthy_since = self._cached_status.healthy_since
        healthy_since = healthy_since or raw_status.checked_at

        elapsed = (raw_status.checked_at - healthy_since).total_seconds()
        remaining = max(self.stability_window_seconds - elapsed, 0)
        if remaining > 0:
            return replace(
                raw_status,
                ready=False,
                reason=ProjectionReadinessReason.STALE_DATA,
                message="Projection readiness stability window has not elapsed.",
                retry_after_seconds=max(int(remaining), 1),
                healthy_since=healthy_since,
            )

        return replace(raw_status, ready=True, retry_after_seconds=0, healthy_since=healthy_since)

    def _store(self, status: ProjectionGateStatus) -> None:
        self._cached_status = status
        self._expires_at = time.monotonic() + self.ttl_seconds

    def _emit_alerts(self, status: ProjectionGateStatus) -> None:
        if status.ready:
            self._unhealthy_since = None
            return

        self._unhealthy_since = self._unhealthy_since or status.checked_at
        unhealthy_for = (status.checked_at - self._unhealthy_since).total_seconds()
        readiness_threshold = _setting_int("PROJECTION_ALERT_READINESS_FALSE_SECONDS", 300)

        if status.drift_count > 0 or status.gap_count > 0:
            logger.critical(
                "Projection drift/gap detected",
                extra={
                    "projection_drift_count": status.drift_count,
                    "projection_gap_count": status.gap_count,
                },
            )
        elif status.reason == ProjectionReadinessReason.LAG_EXCEEDED:
            logger.error(
                "Projection lag threshold breached",
                extra={"projection_lag_seconds": status.lag_seconds},
            )
        elif unhealthy_for >= readiness_threshold:
            logger.error(
                "Projection readiness has been false beyond threshold",
                extra={
                    "unhealthy_for_seconds": unhealthy_for,
                    "readiness_threshold_seconds": readiness_threshold,
                    "reason": status.reason.value if status.reason else None,
                },
            )

    @staticmethod
    async def _publish_metrics(status: ProjectionGateStatus) -> None:
        try:
            await metrics.set_gauge("projection_readiness_status", 1.0 if status.ready else 0.0)
            await metrics.set_gauge("projection_lag_seconds", float(status.lag_seconds or 0.0))
            await metrics.set_gauge("projection_drift_count", float(status.drift_count))
        except (RuntimeError, TypeError, ValueError):
            logger.debug("Failed to publish projection readiness metrics", exc_info=True)


class ProjectionDriftMonitor:
    """One-shot drift monitor primitive for schedulers/background jobs."""

    ROLLBACK_PROTOCOL = (
        "disable projection flags through approved config rollback",
        "return to legacy Mongo reads with flags OFF",
        "preserve projection data",
        "investigate using parity reports, drift logs, and conflict-resolution log",
    )

    def __init__(self, cache: ProjectionGateCache) -> None:
        self.cache = cache

    async def evaluate_once(self) -> ProjectionGateStatus:
        status = await self.cache.get_status(force_refresh=True)
        if status.drift_count > 0 or status.gap_count > 0:
            unhealthy = self.cache.mark_unhealthy(
                reason=ProjectionReadinessReason.PARITY_FAILED,
                message="Projection drift detected; projection reads are disabled by gate.",
            )
            logger.critical(
                "Projection drift detected; follow rollback protocol",
                extra={
                    "projection_drift_count": status.drift_count,
                    "projection_gap_count": status.gap_count,
                    "rollback_protocol": list(self.ROLLBACK_PROTOCOL),
                },
            )
            try:
                await metrics.increment("projection_drift_count")
            except (RuntimeError, TypeError, ValueError):
                logger.debug("Failed to publish projection drift counter", exc_info=True)
            return unhealthy
        return status


_GLOBAL_CACHES: dict[int, ProjectionGateCache] = {}


def get_projection_gate_cache(db: Any) -> ProjectionGateCache:
    """Return a process-local gate cache for a database handle."""

    key = id(db)
    cache = _GLOBAL_CACHES.get(key)
    if cache is None:
        status_store = ProjectionStatusStore(db)
        cache = ProjectionGateCache(ProjectionReadinessGate(status_store))
        _GLOBAL_CACHES[key] = cache
    return cache
