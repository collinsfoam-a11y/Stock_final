"""Cached readiness and integrity controls for projection read cutover."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from fastapi import HTTPException

from backend.config import settings
from backend.services.observability import metrics

logger = logging.getLogger(__name__)


class ProjectionReadinessReason(str, Enum):
    """Standard fail-closed readiness reasons exposed to clients and alerts."""

    PARITY_FAILED = "PARITY_FAILED"
    STALE_DATA = "STALE_DATA"
    LAG_EXCEEDED = "LAG_EXCEEDED"
    COLLECTION_MISSING = "COLLECTION_MISSING"


@dataclass(frozen=True)
class ProjectionGateStatus:
    """Current cached projection readiness status."""

    ready: bool
    raw_ready: bool
    reason: Optional[ProjectionReadinessReason]
    message: str
    retry_after_seconds: int
    checked_at: datetime
    healthy_since: Optional[datetime] = None
    lag_seconds: Optional[float] = None
    drift_count: int = 0
    gap_count: int = 0
    missing_collections: tuple[str, ...] = ()

    def http_detail(self) -> dict[str, Any]:
        """Return the standardized 503 body for projection readiness failures."""

        return {
            "code": "PROJECTION_NOT_READY",
            "reason": (self.reason or ProjectionReadinessReason.PARITY_FAILED).value,
            "retry_after_seconds": self.retry_after_seconds,
            "message": self.message,
            "metrics": {
                "projection_lag_seconds": self.lag_seconds,
                "projection_drift_count": self.drift_count,
                "projection_gap_count": self.gap_count,
            },
            "missing_collections": list(self.missing_collections),
        }


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _parse_datetime(value: Any) -> Optional[datetime]:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc).replace(tzinfo=None)
        except (OSError, ValueError):
            return None
    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return None
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
        return parsed.astimezone(timezone.utc).replace(tzinfo=None) if parsed.tzinfo else parsed
    return None


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value == 1
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return False


def _setting_int(name: str, default: int) -> int:
    try:
        return int(getattr(settings, name, default))
    except (TypeError, ValueError):
        return default


def _setting_float(name: str, default: float) -> float:
    try:
        return float(getattr(settings, name, default))
    except (TypeError, ValueError):
        return default


class ProjectionReadinessGate:
    """Authoritative projection readiness evaluator.

    Request paths use this through :class:`ProjectionGateCache`; this class reads
    only lightweight readiness state produced by out-of-band parity validation.
    It does not execute the parity validator inline.
    """

    REQUIRED_COLLECTIONS = (
        "session_dashboard_projection",
        "verified_items_projection",
        "variance_summary_projection",
        "financial_projection",
        "batch_records",
    )

    def __init__(self, db: Any) -> None:
        self.db = db

    async def evaluate(self) -> ProjectionGateStatus:
        checked_at = _utc_now()
        missing = await self._missing_collections()
        retry_after = _setting_int("PROJECTION_GATE_RETRY_AFTER_SECONDS", 30)

        if missing:
            return ProjectionGateStatus(
                ready=False,
                raw_ready=False,
                reason=ProjectionReadinessReason.COLLECTION_MISSING,
                message="Projection collections are unavailable.",
                retry_after_seconds=retry_after,
                checked_at=checked_at,
                missing_collections=missing,
            )

        status_doc = await self._read_status_document()
        if not status_doc:
            return ProjectionGateStatus(
                ready=False,
                raw_ready=False,
                reason=ProjectionReadinessReason.PARITY_FAILED,
                message="Projection readiness status is unavailable.",
                retry_after_seconds=retry_after,
                checked_at=checked_at,
            )

        metrics_doc = status_doc.get("metrics") if isinstance(status_doc.get("metrics"), dict) else {}
        gap_count = _to_int(
            status_doc.get("projection_gap_count", metrics_doc.get("projection_gap_count")), 0
        )
        drift_count = _to_int(
            status_doc.get("projection_drift_count", metrics_doc.get("projection_drift_count")),
            0,
        )
        lag_seconds = _to_float(
            status_doc.get(
                "projection_lag_seconds",
                status_doc.get("event_lag_seconds", metrics_doc.get("projection_lag_seconds")),
            ),
            0.0,
        )

        parity_fields = [
            status_doc[field_name]
            for field_name in ("parity_passed", "is_consistent", "is_ready")
            if field_name in status_doc
        ]
        parity_passed = bool(parity_fields) and all(_truthy(value) for value in parity_fields)
        if not parity_passed or gap_count > 0 or drift_count > 0:
            return ProjectionGateStatus(
                ready=False,
                raw_ready=False,
                reason=ProjectionReadinessReason.PARITY_FAILED,
                message="Projection parity validation failed.",
                retry_after_seconds=retry_after,
                checked_at=checked_at,
                lag_seconds=lag_seconds,
                drift_count=drift_count,
                gap_count=gap_count,
            )

        max_lag = _setting_float("PROJECTION_MAX_LAG_SECONDS", 5.0)
        if lag_seconds > max_lag:
            return ProjectionGateStatus(
                ready=False,
                raw_ready=False,
                reason=ProjectionReadinessReason.LAG_EXCEEDED,
                message="Projection event lag exceeds the configured threshold.",
                retry_after_seconds=retry_after,
                checked_at=checked_at,
                lag_seconds=lag_seconds,
            )

        freshness_seconds = _setting_int("PROJECTION_FRESHNESS_SECONDS", 300)
        freshness_at = self._status_freshness_time(status_doc)
        if not freshness_at or (checked_at - freshness_at).total_seconds() > freshness_seconds:
            return ProjectionGateStatus(
                ready=False,
                raw_ready=False,
                reason=ProjectionReadinessReason.STALE_DATA,
                message="Projection readiness status is stale.",
                retry_after_seconds=retry_after,
                checked_at=checked_at,
                lag_seconds=lag_seconds,
            )

        return ProjectionGateStatus(
            ready=True,
            raw_ready=True,
            reason=None,
            message="Projection readiness checks passed.",
            retry_after_seconds=0,
            checked_at=checked_at,
            healthy_since=self._status_healthy_since(status_doc),
            lag_seconds=lag_seconds,
            drift_count=drift_count,
            gap_count=gap_count,
        )

    async def _missing_collections(self) -> tuple[str, ...]:
        required = set(self.REQUIRED_COLLECTIONS)
        if hasattr(self.db, "list_collection_names"):
            try:
                existing = set(await self.db.list_collection_names())
                return tuple(sorted(required - existing))
            except Exception:
                logger.debug("Could not list projection collections", exc_info=True)

        missing = [name for name in self.REQUIRED_COLLECTIONS if not hasattr(self.db, name)]
        return tuple(sorted(missing))

    async def _read_status_document(self) -> Optional[dict[str, Any]]:
        collection_name = str(
            getattr(settings, "PROJECTION_READINESS_COLLECTION", "projection_readiness")
        )
        document_id = str(getattr(settings, "PROJECTION_READINESS_DOCUMENT_ID", "current"))
        collection = self.db[collection_name]

        for query in ({"_id": document_id}, {"id": document_id}, {"name": document_id}):
            document = await collection.find_one(query)
            if document:
                return document

        return await collection.find_one(sort=[("updated_at", -1)])

    @staticmethod
    def _status_freshness_time(status_doc: dict[str, Any]) -> Optional[datetime]:
        for field_name in ("validated_at", "updated_at", "generated_at", "created_at"):
            parsed = _parse_datetime(status_doc.get(field_name))
            if parsed:
                return parsed
        return None

    @staticmethod
    def _status_healthy_since(status_doc: dict[str, Any]) -> Optional[datetime]:
        for field_name in ("healthy_since", "ready_since", "stable_since"):
            parsed = _parse_datetime(status_doc.get(field_name))
            if parsed:
                return parsed
        return None


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
                checked_at=_utc_now(),
            )
            await self._publish_metrics(status)
            self._store(status)
            return status

        raw_status = await self.gate.evaluate()
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
            checked_at=_utc_now(),
            drift_count=1,
        )
        self._store(status)
        return status

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
        except Exception:
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
            except Exception:
                logger.debug("Failed to publish projection drift counter", exc_info=True)
            return unhealthy
        return status


_GLOBAL_CACHES: dict[int, ProjectionGateCache] = {}


def get_projection_gate_cache(db: Any) -> ProjectionGateCache:
    """Return a process-local gate cache for a database handle."""

    key = id(db)
    cache = _GLOBAL_CACHES.get(key)
    if cache is None:
        cache = ProjectionGateCache(ProjectionReadinessGate(db))
        _GLOBAL_CACHES[key] = cache
    return cache
