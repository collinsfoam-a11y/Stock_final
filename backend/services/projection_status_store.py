"""Persistent projection readiness status store.

This module is the single source of truth for reading projection readiness
state. Request-time gates and caches must consume the parsed status returned
from this store instead of querying projection collections or recomputing
parity/freshness/lag inline.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pymongo.errors import PyMongoError

from backend.config import settings


class ProjectionStatusUnavailable(RuntimeError):
    """Raised when persisted projection readiness status cannot be read."""


class ProjectionReadinessReason(str, Enum):
    """Standard fail-closed readiness reasons exposed to clients and alerts."""

    PARITY_FAILED = "PARITY_FAILED"
    STALE_DATA = "STALE_DATA"
    LAG_EXCEEDED = "LAG_EXCEEDED"
    COLLECTION_MISSING = "COLLECTION_MISSING"


@dataclass(frozen=True)
class ProjectionGateStatus:
    """Current projection readiness status."""

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


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def parse_datetime(value: Any) -> Optional[datetime]:
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


def _reason(value: Any) -> Optional[ProjectionReadinessReason]:
    if not value:
        return None
    try:
        return ProjectionReadinessReason(str(value))
    except ValueError:
        return ProjectionReadinessReason.PARITY_FAILED


class ProjectionStatusStore:
    """Read and normalize persisted projection readiness status."""

    def __init__(
        self,
        db: Any,
        *,
        collection_name: Optional[str] = None,
        document_id: Optional[str] = None,
    ) -> None:
        self.db = db
        self.collection_name = collection_name or str(
            getattr(settings, "PROJECTION_READINESS_COLLECTION", "projection_readiness")
        )
        self.document_id = document_id or str(
            getattr(settings, "PROJECTION_READINESS_DOCUMENT_ID", "current")
        )

    async def read_status(self) -> ProjectionGateStatus:
        checked_at = utc_now()
        retry_after = _setting_int("PROJECTION_GATE_RETRY_AFTER_SECONDS", 30)
        document = await self._read_document()
        if not document:
            return ProjectionGateStatus(
                ready=False,
                raw_ready=False,
                reason=ProjectionReadinessReason.PARITY_FAILED,
                message="Projection readiness status is unavailable.",
                retry_after_seconds=retry_after,
                checked_at=checked_at,
            )

        return self._status_from_document(document, checked_at=checked_at)

    async def _read_document(self) -> Optional[dict[str, Any]]:
        collection = self.db[self.collection_name]
        try:
            for query in (
                {"_id": self.document_id},
                {"id": self.document_id},
                {"name": self.document_id},
            ):
                document = await collection.find_one(query)
                if document:
                    return document
            return await collection.find_one(sort=[("updated_at", -1)])
        except PyMongoError as exc:
            raise ProjectionStatusUnavailable(
                "Projection readiness status store is unavailable"
            ) from exc

    def _status_from_document(
        self,
        document: dict[str, Any],
        *,
        checked_at: datetime,
    ) -> ProjectionGateStatus:
        retry_after = _setting_int("PROJECTION_GATE_RETRY_AFTER_SECONDS", 30)
        metrics_doc = document.get("metrics") if isinstance(document.get("metrics"), dict) else {}
        gap_count = _to_int(
            document.get("projection_gap_count", metrics_doc.get("projection_gap_count")), 0
        )
        drift_count = _to_int(
            document.get("projection_drift_count", metrics_doc.get("projection_drift_count")),
            0,
        )
        lag_seconds = _to_float(
            document.get(
                "projection_lag_seconds",
                document.get("event_lag_seconds", metrics_doc.get("projection_lag_seconds")),
            ),
            0.0,
        )
        missing_collections = tuple(
            str(value)
            for value in document.get("missing_collections", ())
            if value not in (None, "")
        )

        explicit_reason = _reason(document.get("reason"))
        if missing_collections:
            return ProjectionGateStatus(
                ready=False,
                raw_ready=False,
                reason=ProjectionReadinessReason.COLLECTION_MISSING,
                message=str(document.get("message") or "Projection collections are unavailable."),
                retry_after_seconds=retry_after,
                checked_at=checked_at,
                missing_collections=missing_collections,
                lag_seconds=lag_seconds,
                drift_count=drift_count,
                gap_count=gap_count,
            )

        if explicit_reason and _truthy(document.get("ready")) is False:
            return ProjectionGateStatus(
                ready=False,
                raw_ready=False,
                reason=explicit_reason,
                message=str(document.get("message") or "Projection is not ready."),
                retry_after_seconds=retry_after,
                checked_at=checked_at,
                lag_seconds=lag_seconds,
                drift_count=drift_count,
                gap_count=gap_count,
            )

        parity_fields = [
            document[field_name]
            for field_name in ("parity_passed", "is_consistent", "is_ready", "ready")
            if field_name in document
        ]
        parity_passed = bool(parity_fields) and all(_truthy(value) for value in parity_fields)
        if not parity_passed or gap_count > 0 or drift_count > 0:
            return ProjectionGateStatus(
                ready=False,
                raw_ready=False,
                reason=ProjectionReadinessReason.PARITY_FAILED,
                message=str(document.get("message") or "Projection parity validation failed."),
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
        freshness_at = self._status_freshness_time(document)
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
            message=str(document.get("message") or "Projection readiness checks passed."),
            retry_after_seconds=0,
            checked_at=checked_at,
            healthy_since=self._status_healthy_since(document),
            lag_seconds=lag_seconds,
            drift_count=drift_count,
            gap_count=gap_count,
        )

    @staticmethod
    def _status_freshness_time(document: dict[str, Any]) -> Optional[datetime]:
        for field_name in ("validated_at", "updated_at", "generated_at", "created_at"):
            parsed = parse_datetime(document.get(field_name))
            if parsed:
                return parsed
        return None

    @staticmethod
    def _status_healthy_since(document: dict[str, Any]) -> Optional[datetime]:
        for field_name in ("healthy_since", "ready_since", "stable_since", "stability_since"):
            parsed = parse_datetime(document.get(field_name))
            if parsed:
                return parsed
        return None
