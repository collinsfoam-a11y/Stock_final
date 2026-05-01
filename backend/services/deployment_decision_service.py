"""Data-driven go/no-go decisions for projection rollout."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable, Optional

from backend.config import settings
from backend.services.shadow_monitor_service import (
    ShadowHealth,
    ShadowMonitorService,
    endpoint_failure_reason,
)


@dataclass(frozen=True)
class DeploymentDecision:
    decision: str
    healthy: bool
    reason: str
    healthy_for_seconds: float
    required_window_seconds: int
    metrics: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "decision": self.decision,
            "healthy": self.healthy,
            "reason": self.reason,
            "healthy_for_seconds": self.healthy_for_seconds,
            "required_window_seconds": self.required_window_seconds,
            "metrics": self.metrics,
        }


class DeploymentDecisionService:
    """Track whether shadow health has been clean for the required window."""

    def __init__(
        self,
        monitor: Optional[ShadowMonitorService] = None,
        *,
        required_window_seconds: Optional[int] = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._monitor = monitor or ShadowMonitorService()
        self._required_window_seconds = int(
            required_window_seconds
            if required_window_seconds is not None
            else settings.SHADOW_DECISION_WINDOW_SECONDS
        )
        self._clock = clock
        self._healthy_since: Optional[float] = None

    async def get_decision(self) -> DeploymentDecision:
        return self.evaluate_health(await self._monitor.evaluate_current_health())

    async def get_health_and_decision(self) -> tuple[ShadowHealth, DeploymentDecision]:
        health = await self._monitor.evaluate_current_health()
        return health, self.evaluate_health(health)

    def evaluate_health(self, health: ShadowHealth) -> DeploymentDecision:
        now = self._clock()
        endpoint_reason = endpoint_failure_reason(health)
        base_healthy = health.healthy and endpoint_reason is None
        if base_healthy:
            if self._healthy_since is None:
                self._healthy_since = now
            healthy_for = now - self._healthy_since
        else:
            self._healthy_since = None
            healthy_for = 0.0

        if endpoint_reason is not None:
            decision = "NO-GO"
            reason = endpoint_reason
        elif health.healthy and healthy_for >= self._required_window_seconds:
            decision = "GO"
            reason = "shadow_health_window_satisfied"
        elif health.healthy:
            decision = "NO-GO"
            reason = "shadow_health_window_pending"
        else:
            decision = "NO-GO"
            reason = health.reason

        return DeploymentDecision(
            decision=decision,
            healthy=base_healthy,
            reason=reason,
            healthy_for_seconds=healthy_for,
            required_window_seconds=self._required_window_seconds,
            metrics=health.to_dict(),
        )
