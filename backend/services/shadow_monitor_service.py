"""Shadow-read health aggregation and threshold evaluation."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from math import ceil
from typing import Any, Callable, Optional

from backend.config import settings
from backend.services.metrics import (
    PROJECTION_LAG_SECONDS,
    PROJECTION_READINESS_STATUS,
    SHADOW_ERROR_COUNT,
    SHADOW_MISMATCH_COUNT,
    SHADOW_TIMEOUT_COUNT,
    SHADOW_TOTAL_REQUESTS,
)
from backend.services.observability import metrics as default_metrics

METRIC_KEY_RE = re.compile(r"^(?P<name>[^{]+)(?:\{(?P<labels>.*)\})?$")
LABEL_RE = re.compile(r'(?P<key>[a-zA-Z_][a-zA-Z0-9_]*)="(?P<value>[^"]*)"')


@dataclass(frozen=True)
class ShadowEndpointStats:
    total: int = 0
    mismatch: int = 0
    timeout: int = 0
    error: int = 0

    def to_dict(self) -> dict[str, int]:
        return asdict(self)

    @property
    def mismatch_rate(self) -> float:
        return _rate(self.mismatch, self.total)

    @property
    def timeout_rate(self) -> float:
        return _rate(self.timeout, self.total)

    @property
    def error_rate(self) -> float:
        return _rate(self.error, self.total)


@dataclass(frozen=True)
class ShadowStats:
    total: int = 0
    mismatch: int = 0
    timeout: int = 0
    error: int = 0
    endpoints: dict[str, ShadowEndpointStats] | None = None

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["endpoints"] = {
            endpoint: stats.to_dict()
            for endpoint, stats in sorted((self.endpoints or {}).items())
        }
        return data


@dataclass(frozen=True)
class ShadowHealth:
    healthy: bool
    reason: str
    total: int
    mismatch: int
    timeout: int
    error: int
    mismatch_rate: float
    timeout_rate: float
    error_rate: float
    endpoints: dict[str, ShadowEndpointStats]

    def to_dict(self) -> dict[str, Any]:
        return {
            "healthy": self.healthy,
            "reason": self.reason,
            "total": self.total,
            "mismatch": self.mismatch,
            "timeout": self.timeout,
            "error": self.error,
            "mismatch_rate": self.mismatch_rate,
            "timeout_rate": self.timeout_rate,
            "error_rate": self.error_rate,
            "endpoints": {
                endpoint: {
                    **stats.to_dict(),
                    "mismatch_rate": stats.mismatch_rate,
                    "timeout_rate": stats.timeout_rate,
                    "error_rate": stats.error_rate,
                }
                for endpoint, stats in sorted(self.endpoints.items())
            },
        }


@dataclass(frozen=True)
class ShadowWindowPoint:
    ts: datetime
    healthy: bool
    total: int = 0
    reason: str = ""


@dataclass(frozen=True)
class ShadowStability:
    stable: bool
    reason: str
    points: int
    min_points: int
    window_seconds: float
    required_window_seconds: int
    discarded_points: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ShadowRecentWindow:
    healthy: bool
    reason: str
    points: int
    window_seconds: int
    mismatch_rate: float
    timeout_rate: float
    error_rate: float
    discarded_points: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ProjectionReadinessCheck:
    healthy: bool
    reason: str
    readiness_status: Optional[float] = None
    lag_seconds: Optional[float] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _rate(value: int, total: int) -> float:
    return value / total if total else 0.0


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _parse_timestamp(value: Any) -> Optional[datetime]:
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


def evaluate_shadow_health(
    stats: ShadowStats | dict[str, Any],
    *,
    max_mismatch_rate: Optional[float] = None,
    max_timeout_rate: Optional[float] = None,
    max_error_rate: Optional[float] = None,
) -> ShadowHealth:
    """Evaluate current shadow-read health against rollout thresholds."""

    if isinstance(stats, ShadowStats):
        total = stats.total
        mismatch = stats.mismatch
        timeout = stats.timeout
        error = stats.error
        endpoints = stats.endpoints or {}
    else:
        total = int(stats.get("total", 0) or 0)
        mismatch = int(stats.get("mismatch", 0) or 0)
        timeout = int(stats.get("timeout", 0) or 0)
        error = int(stats.get("error", 0) or 0)
        raw_endpoints = stats.get("endpoints", {}) if isinstance(stats.get("endpoints"), dict) else {}
        endpoints = {
            endpoint: (
                value
                if isinstance(value, ShadowEndpointStats)
                else ShadowEndpointStats(
                    total=int(value.get("total", 0) or 0),
                    mismatch=int(value.get("mismatch", 0) or 0),
                    timeout=int(value.get("timeout", 0) or 0),
                    error=int(value.get("error", 0) or 0),
                )
            )
            for endpoint, value in raw_endpoints.items()
            if isinstance(value, (dict, ShadowEndpointStats))
        }

    mismatch_rate = _rate(mismatch, total)
    timeout_rate = _rate(timeout, total)
    error_rate = _rate(error, total)
    mismatch_limit = (
        float(max_mismatch_rate)
        if max_mismatch_rate is not None
        else float(settings.SHADOW_MISMATCH_THRESHOLD)
    )
    timeout_limit = (
        float(max_timeout_rate)
        if max_timeout_rate is not None
        else float(settings.SHADOW_TIMEOUT_THRESHOLD)
    )
    error_limit = (
        float(max_error_rate)
        if max_error_rate is not None
        else float(settings.SHADOW_ERROR_THRESHOLD)
    )

    if total <= 0:
        healthy = False
        reason = "no_shadow_data"
    elif mismatch_rate >= mismatch_limit:
        healthy = False
        reason = "mismatch_rate_exceeded"
    elif timeout_rate >= timeout_limit:
        healthy = False
        reason = "timeout_rate_exceeded"
    elif error_rate > error_limit:
        healthy = False
        reason = "error_rate_exceeded"
    else:
        healthy = True
        reason = "healthy"

    return ShadowHealth(
        healthy=healthy,
        reason=reason,
        total=total,
        mismatch=mismatch,
        timeout=timeout,
        error=error,
        mismatch_rate=mismatch_rate,
        timeout_rate=timeout_rate,
        error_rate=error_rate,
        endpoints=endpoints,
    )


def endpoint_failure_reason(
    health: ShadowHealth,
    *,
    max_mismatch_rate: Optional[float] = None,
    max_timeout_rate: Optional[float] = None,
    max_error_rate: Optional[float] = None,
) -> Optional[str]:
    mismatch_limit = (
        float(max_mismatch_rate)
        if max_mismatch_rate is not None
        else float(settings.SHADOW_MISMATCH_THRESHOLD)
    )
    timeout_limit = (
        float(max_timeout_rate)
        if max_timeout_rate is not None
        else float(settings.SHADOW_TIMEOUT_THRESHOLD)
    )
    error_limit = (
        float(max_error_rate)
        if max_error_rate is not None
        else float(settings.SHADOW_ERROR_THRESHOLD)
    )
    for endpoint, stats in sorted(health.endpoints.items()):
        if stats.total <= 0:
            continue
        if stats.mismatch_rate > mismatch_limit:
            return f"endpoint_specific_mismatch:{endpoint}"
        if stats.timeout_rate > timeout_limit:
            return f"endpoint_specific_timeout:{endpoint}"
        if stats.error_rate > error_limit:
            return f"endpoint_specific_error:{endpoint}"
    return None


def evaluate_stability_window(
    points: list[ShadowWindowPoint | dict[str, Any]],
    *,
    min_window_minutes: Optional[int] = None,
    eval_interval_seconds: Optional[int] = None,
    now: Optional[datetime] = None,
    max_clock_skew_seconds: Optional[int] = None,
) -> ShadowStability:
    required_window_seconds = int(
        (min_window_minutes if min_window_minutes is not None else settings.SHADOW_MIN_STABLE_WINDOW_MINUTES)
        * 60
    )
    interval_seconds = int(
        eval_interval_seconds
        if eval_interval_seconds is not None
        else settings.SHADOW_EVAL_INTERVAL_SECONDS
    )
    min_points = max(1, ceil(required_window_seconds / max(interval_seconds, 1)))
    normalized: list[ShadowWindowPoint] = []
    for point in points:
        if isinstance(point, ShadowWindowPoint):
            normalized.append(point)
            continue
        timestamp = _parse_timestamp(point.get("ts") or point.get("timestamp"))
        if timestamp is not None:
            normalized.append(
                ShadowWindowPoint(
                    ts=timestamp,
                    healthy=bool(point.get("healthy")),
                    total=int(point.get("total", 0) or 0),
                    reason=str(point.get("reason") or ""),
                )
            )

    if not normalized:
        return ShadowStability(
            stable=False,
            reason="missing_stability_timestamps",
            points=0,
            min_points=min_points,
            window_seconds=0.0,
            required_window_seconds=required_window_seconds,
        )

    sorted_points = sorted(normalized, key=lambda point: point.ts)
    end = now.replace(tzinfo=None) if now else sorted_points[-1].ts
    skew_limit = int(
        max_clock_skew_seconds
        if max_clock_skew_seconds is not None
        else settings.SHADOW_MAX_CLOCK_SKEW_SECONDS
    )
    before_skew_filter = len(sorted_points)
    sorted_points = [
        point
        for point in sorted_points
        if point.ts.timestamp() <= end.timestamp() + skew_limit
    ]
    discarded_points = before_skew_filter - len(sorted_points)
    if not sorted_points:
        return ShadowStability(
            stable=False,
            reason="all_points_discarded_for_clock_skew",
            points=0,
            min_points=min_points,
            window_seconds=0.0,
            required_window_seconds=required_window_seconds,
            discarded_points=discarded_points,
        )
    start = end.timestamp() - required_window_seconds
    window_points = [point for point in sorted_points if point.ts.timestamp() >= start]
    if len(window_points) < min_points:
        return ShadowStability(
            stable=False,
            reason="insufficient_stability_points",
            points=len(window_points),
            min_points=min_points,
            window_seconds=(
                window_points[-1].ts - window_points[0].ts
            ).total_seconds()
            if len(window_points) >= 2
            else 0.0,
            required_window_seconds=required_window_seconds,
            discarded_points=discarded_points,
        )

    span = (window_points[-1].ts - window_points[0].ts).total_seconds()
    if span < required_window_seconds:
        return ShadowStability(
            stable=False,
            reason="stability_window_span_incomplete",
            points=len(window_points),
            min_points=min_points,
            window_seconds=span,
            required_window_seconds=required_window_seconds,
            discarded_points=discarded_points,
        )
    if not all(point.healthy for point in window_points):
        return ShadowStability(
            stable=False,
            reason="unhealthy_point_in_stability_window",
            points=len(window_points),
            min_points=min_points,
            window_seconds=span,
            required_window_seconds=required_window_seconds,
            discarded_points=discarded_points,
        )
    return ShadowStability(
        stable=True,
        reason="stable_window_satisfied",
        points=len(window_points),
        min_points=min_points,
        window_seconds=span,
        required_window_seconds=required_window_seconds,
        discarded_points=discarded_points,
    )


def evaluate_recent_window(
    points: list[ShadowWindowPoint | dict[str, Any]],
    *,
    recent_window_minutes: Optional[int] = None,
    now: Optional[datetime] = None,
    max_clock_skew_seconds: Optional[int] = None,
) -> ShadowRecentWindow:
    window_seconds = int(
        (recent_window_minutes if recent_window_minutes is not None else settings.SHADOW_RECENT_WINDOW_MINUTES)
        * 60
    )
    normalized: list[ShadowWindowPoint] = []
    for point in points:
        if isinstance(point, ShadowWindowPoint):
            normalized.append(point)
            continue
        timestamp = _parse_timestamp(point.get("ts") or point.get("timestamp"))
        if timestamp is not None:
            normalized.append(
                ShadowWindowPoint(
                    ts=timestamp,
                    healthy=bool(point.get("healthy")),
                    total=int(point.get("total", 0) or 0),
                    reason=str(point.get("reason") or ""),
                )
            )
    if not normalized:
        return ShadowRecentWindow(
            healthy=False,
            reason="missing_recent_window_timestamps",
            points=0,
            window_seconds=window_seconds,
            mismatch_rate=0.0,
            timeout_rate=0.0,
            error_rate=0.0,
        )

    sorted_points = sorted(normalized, key=lambda point: point.ts)
    end = now.replace(tzinfo=None) if now else sorted_points[-1].ts
    skew_limit = int(
        max_clock_skew_seconds
        if max_clock_skew_seconds is not None
        else settings.SHADOW_MAX_CLOCK_SKEW_SECONDS
    )
    before_skew_filter = len(sorted_points)
    sorted_points = [
        point
        for point in sorted_points
        if point.ts.timestamp() <= end.timestamp() + skew_limit
    ]
    discarded_points = before_skew_filter - len(sorted_points)
    start = end.timestamp() - window_seconds
    window_points = [point for point in sorted_points if point.ts.timestamp() >= start]
    if not window_points:
        return ShadowRecentWindow(
            healthy=False,
            reason="missing_recent_window_points",
            points=0,
            window_seconds=window_seconds,
            mismatch_rate=0.0,
            timeout_rate=0.0,
            error_rate=0.0,
            discarded_points=discarded_points,
        )

    mismatch = sum(1 for point in window_points if point.reason == "mismatch")
    timeout = sum(1 for point in window_points if point.reason == "timeout")
    error = sum(1 for point in window_points if point.reason == "error")
    total = len(window_points)
    mismatch_rate = _rate(mismatch, total)
    timeout_rate = _rate(timeout, total)
    error_rate = _rate(error, total)
    if mismatch_rate >= float(settings.SHADOW_MISMATCH_THRESHOLD):
        reason = "recent_mismatch_rate_exceeded"
    elif timeout_rate >= float(settings.SHADOW_TIMEOUT_THRESHOLD):
        reason = "recent_timeout_rate_exceeded"
    elif error_rate > float(settings.SHADOW_ERROR_THRESHOLD):
        reason = "recent_error_rate_exceeded"
    elif not all(point.healthy for point in window_points):
        reason = "recent_unhealthy_point"
    else:
        reason = "recent_window_healthy"
    return ShadowRecentWindow(
        healthy=reason == "recent_window_healthy",
        reason=reason,
        points=total,
        window_seconds=window_seconds,
        mismatch_rate=mismatch_rate,
        timeout_rate=timeout_rate,
        error_rate=error_rate,
        discarded_points=discarded_points,
    )


def _parse_metric_key(key: str) -> tuple[str, dict[str, str]]:
    match = METRIC_KEY_RE.match(key)
    if not match:
        return key, {}
    labels = {
        label.group("key"): label.group("value")
        for label in LABEL_RE.finditer(match.group("labels") or "")
    }
    return match.group("name"), labels


def _add_endpoint_counts(
    endpoints: dict[str, dict[str, int]],
    endpoint: str,
    field_name: str,
    value: int,
) -> None:
    counts = endpoints.setdefault(
        endpoint,
        {"total": 0, "mismatch": 0, "timeout": 0, "error": 0},
    )
    counts[field_name] += value


class ShadowMonitorService:
    """Read shadow metrics and compute go/no-go health signals."""

    def __init__(
        self,
        metrics_provider: Optional[Callable[[], Any]] = None,
    ) -> None:
        self._metrics_provider = metrics_provider or default_metrics.get_metrics
        self._window: list[ShadowWindowPoint] = []

    async def get_shadow_stats(self) -> ShadowStats:
        raw_metrics = await self._metrics_provider()
        counters = raw_metrics.get("counters", {}) if isinstance(raw_metrics, dict) else {}
        totals = {"total": 0, "mismatch": 0, "timeout": 0, "error": 0}
        endpoints: dict[str, dict[str, int]] = {}

        for key, raw_value in counters.items():
            metric_name, labels = _parse_metric_key(str(key))
            endpoint = labels.get("endpoint", "unknown")
            value = int(raw_value or 0)
            if metric_name == SHADOW_TOTAL_REQUESTS:
                totals["total"] += value
                _add_endpoint_counts(endpoints, endpoint, "total", value)
            elif metric_name == SHADOW_MISMATCH_COUNT:
                totals["mismatch"] += value
                _add_endpoint_counts(endpoints, endpoint, "mismatch", value)
            elif metric_name == SHADOW_TIMEOUT_COUNT:
                totals["timeout"] += value
                _add_endpoint_counts(endpoints, endpoint, "timeout", value)
            elif metric_name == SHADOW_ERROR_COUNT:
                totals["error"] += value
                _add_endpoint_counts(endpoints, endpoint, "error", value)

        endpoint_stats = {
            endpoint: ShadowEndpointStats(**counts)
            for endpoint, counts in endpoints.items()
        }
        return ShadowStats(endpoints=endpoint_stats, **totals)

    async def evaluate_current_health(self) -> ShadowHealth:
        return evaluate_shadow_health(await self.get_shadow_stats())

    async def evaluate_current_stability(self) -> ShadowStability:
        health = await self.evaluate_current_health()
        now = _utc_now()
        self._window.append(
            ShadowWindowPoint(
                ts=now,
                healthy=health.healthy,
                total=health.total,
                reason=health.reason,
            )
        )
        max_age_seconds = settings.SHADOW_MIN_STABLE_WINDOW_MINUTES * 60
        cutoff = now.timestamp() - max_age_seconds
        self._window = [point for point in self._window if point.ts.timestamp() >= cutoff]
        return evaluate_stability_window(self._window, now=now)

    async def evaluate_current_recent_window(self) -> ShadowRecentWindow:
        if not self._window:
            await self.evaluate_current_stability()
        return evaluate_recent_window(self._window, now=_utc_now())

    async def evaluate_projection_readiness(self) -> ProjectionReadinessCheck:
        raw_metrics = await self._metrics_provider()
        gauges = raw_metrics.get("gauges", {}) if isinstance(raw_metrics, dict) else {}
        readiness_status = gauges.get(PROJECTION_READINESS_STATUS)
        lag_seconds = gauges.get(PROJECTION_LAG_SECONDS)
        if readiness_status is None:
            return ProjectionReadinessCheck(
                healthy=False,
                reason="projection_readiness_metric_missing",
            )
        try:
            readiness_value = float(readiness_status)
            lag_value = float(lag_seconds or 0.0)
        except (TypeError, ValueError):
            return ProjectionReadinessCheck(
                healthy=False,
                reason="projection_readiness_metric_invalid",
            )
        if readiness_value < 1.0:
            return ProjectionReadinessCheck(
                healthy=False,
                reason="projection_readiness_false",
                readiness_status=readiness_value,
                lag_seconds=lag_value,
            )
        if lag_value > float(settings.PROJECTION_MAX_LAG_SECONDS):
            return ProjectionReadinessCheck(
                healthy=False,
                reason="projection_lag_exceeded",
                readiness_status=readiness_value,
                lag_seconds=lag_value,
            )
        return ProjectionReadinessCheck(
            healthy=True,
            reason="projection_readiness_healthy",
            readiness_status=readiness_value,
            lag_seconds=lag_value,
        )
