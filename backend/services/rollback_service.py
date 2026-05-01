"""Projection rollback decision planning."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from backend.config import settings
from backend.services.rollout_controller import format_env_patch
from backend.services.shadow_monitor_service import ShadowHealth

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RollbackPlan:
    triggered: bool
    state: str
    reason: str
    environment_updates: dict[str, str]
    manual_confirmation_required: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "triggered": self.triggered,
            "state": self.state,
            "reason": self.reason,
            "environment_updates": self.environment_updates,
            "rollback_patch": format_env_patch(self.environment_updates),
            "manual_confirmation_required": self.manual_confirmation_required,
        }


class RollbackService:
    """Detect projection risk and produce a reversible rollback plan."""

    def __init__(
        self,
        *,
        mismatch_spike_rate: float | None = None,
        timeout_spike_rate: float | None = None,
    ) -> None:
        self._mismatch_spike_rate = float(
            mismatch_spike_rate
            if mismatch_spike_rate is not None
            else settings.AUTO_ROLLBACK_MISMATCH_RATE
        )
        self._timeout_spike_rate = float(
            timeout_spike_rate
            if timeout_spike_rate is not None
            else settings.AUTO_ROLLBACK_TIMEOUT_RATE
        )

    def evaluate(self, health: ShadowHealth) -> RollbackPlan:
        reason = self._risk_reason(health)
        if reason is None:
            return RollbackPlan(
                triggered=False,
                state="STABLE",
                reason="shadow_health_within_rollback_thresholds",
                environment_updates={},
                manual_confirmation_required=False,
            )

        updates = {
            "ROLLOUT_STAGE": "0",
            "V3_PROJECTION_DASHBOARD_READS": "false",
            "V3_PROJECTION_REPORT_READS": "false",
            "SHADOW_READ_ENABLED": "true",
        }
        logger.critical(
            "AUTO ROLLBACK TRIGGERED",
            extra={
                "reason": reason,
                "mismatch_rate": health.mismatch_rate,
                "timeout_rate": health.timeout_rate,
                "error_rate": health.error_rate,
            },
        )
        return RollbackPlan(
            triggered=True,
            state="ROLLED_BACK",
            reason=reason,
            environment_updates=updates,
        )

    def _risk_reason(self, health: ShadowHealth) -> str | None:
        if not settings.AUTO_ROLLBACK_ENABLED:
            return None
        if health.error_rate > 0:
            return "shadow_error_detected"
        if health.mismatch_rate > self._mismatch_spike_rate:
            return "shadow_mismatch_spike"
        if health.timeout_rate > self._timeout_spike_rate:
            return "shadow_timeout_spike"
        return None
