"""Background projection readiness auto-refresh worker."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from backend.config import settings
from backend.services.projection_readiness_gate import (
    ProjectionDriftMonitor,
    get_projection_gate_cache,
)
from backend.services.projection_status_store import (
    ProjectionGateStatus,
    ProjectionReadinessReason,
)

logger = logging.getLogger(__name__)


def _setting_int(name: str, default: int) -> int:
    try:
        return int(getattr(settings, name, default))
    except (TypeError, ValueError):
        return default


class ProjectionReadinessWorker:
    """Keeps projection readiness fresh without manual republish steps."""

    def __init__(self, db: Any, *, interval_seconds: Optional[int] = None) -> None:
        self.db = db
        self.cache = get_projection_gate_cache(db)
        self.monitor = ProjectionDriftMonitor(self.cache)
        self.status_store = self.cache.gate.status_store
        self.interval_seconds = max(
            5,
            interval_seconds
            or _setting_int("PROJECTION_AUTO_REFRESH_SECONDS", 30),
        )
        self._stop_event = asyncio.Event()
        self._task: Optional[asyncio.Task[None]] = None

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run(), name="projection-readiness-worker")

    async def stop(self) -> None:
        self._stop_event.set()
        if not self._task:
            return
        try:
            await asyncio.wait_for(self._task, timeout=10)
        except asyncio.TimeoutError:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        finally:
            self._task = None

    async def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._tick()
            except Exception:
                logger.exception("Projection readiness worker tick failed")

            try:
                await asyncio.wait_for(
                    self._stop_event.wait(),
                    timeout=self.interval_seconds,
                )
            except asyncio.TimeoutError:
                pass

    async def _tick(self) -> None:
        status = await self.monitor.evaluate_once()
        if status.ready:
            return

        if status.reason == ProjectionReadinessReason.STALE_DATA:
            refreshed = await self.status_store.refresh_ready_status()
            if refreshed:
                self.cache.invalidate()
                refreshed_status = await self.cache.get_status(force_refresh=True)
                self._log_status("projection_readiness_auto_refreshed", refreshed_status)
                return
            self._log_status("projection_readiness_refresh_skipped", status)
            return

        self._log_status("projection_readiness_unhealthy", status)

    @staticmethod
    def _log_status(event: str, status: ProjectionGateStatus) -> None:
        level = logging.ERROR
        if status.reason == ProjectionReadinessReason.DRIFT_DETECTED:
            level = logging.CRITICAL
        elif status.reason in {
            ProjectionReadinessReason.STALE_DATA,
            ProjectionReadinessReason.LAG_EXCEEDED,
        }:
            level = logging.WARNING

        logger.log(
            level,
            event,
            extra={
                "projection_reason": status.reason.value if status.reason else None,
                "projection_ready": status.ready,
                "projection_drift_count": status.drift_count,
                "projection_gap_count": status.gap_count,
                "projection_lag_seconds": status.lag_seconds,
                "projection_freshness_lag": status.freshness_lag_seconds,
                "retry_after_seconds": status.retry_after_seconds,
            },
        )
