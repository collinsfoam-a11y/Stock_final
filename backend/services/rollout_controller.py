"""Projection rollout stage planning."""

from __future__ import annotations

import time
import hashlib
from dataclasses import dataclass
from typing import Any, Callable, Optional

from backend.config import settings

ROLLOUT_STAGES = {
    0: "shadow_only",
    1: "admin_projection",
    2: "partial_rollout",
    3: "full_rollout",
}
KNOWN_ENV_KEYS = {
    "ROLLOUT_STAGE",
    "V3_PROJECTION_DASHBOARD_READS",
    "V3_PROJECTION_REPORT_READS",
    "SHADOW_READ_ENABLED",
    "SHADOW_READ_SAMPLE_RATE",
}


@dataclass(frozen=True)
class RolloutPlan:
    status: str
    current_stage: int
    next_stage: int
    stage_name: str
    environment_updates: dict[str, str]
    rollback_updates: dict[str, str]
    reason: str
    patch_errors: tuple[str, ...] = ()
    cooldown_remaining_seconds: float = 0.0
    manual_confirmation_required: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "current_stage": self.current_stage,
            "next_stage": self.next_stage,
            "stage_name": self.stage_name,
            "environment_updates": self.environment_updates,
            "rollback_updates": self.rollback_updates,
            "reason": self.reason,
            "patch_errors": list(self.patch_errors),
            "cooldown_remaining_seconds": self.cooldown_remaining_seconds,
            "apply_patch": format_env_patch(self.environment_updates),
            "rollback_patch": format_env_patch(self.rollback_updates),
            "manual_confirmation_required": self.manual_confirmation_required,
        }


def _patch_body(updates: dict[str, str]) -> str:
    return "\n".join(f"{key}={value}" for key, value in sorted(updates.items()))


def patch_checksum(updates: dict[str, str]) -> str:
    return hashlib.sha256(_patch_body(updates).encode("utf-8")).hexdigest()[:12]


def format_env_patch(updates: dict[str, str]) -> str:
    body = _patch_body(updates)
    if not body:
        return "# checksum: empty"
    return f"# checksum: {patch_checksum(updates)}\n{body}"


def validate_env_patch(updates: dict[str, str], *, current_stage: int, next_stage: int) -> tuple[str, ...]:
    errors: list[str] = []
    unknown_keys = sorted(set(updates) - KNOWN_ENV_KEYS)
    if unknown_keys:
        errors.append(f"unknown_env_keys:{','.join(unknown_keys)}")
    stage_value = updates.get("ROLLOUT_STAGE")
    if stage_value != str(next_stage):
        errors.append("rollout_stage_mismatch")
    if next_stage < current_stage:
        errors.append("invalid_stage_regression")
    dashboard_expected = str(next_stage >= 1).lower()
    report_expected = str(next_stage >= 3).lower()
    if updates.get("V3_PROJECTION_DASHBOARD_READS") != dashboard_expected:
        errors.append("dashboard_flag_conflict")
    if updates.get("V3_PROJECTION_REPORT_READS") != report_expected:
        errors.append("report_flag_conflict")
    return tuple(errors)


class RolloutController:
    """Compute controlled rollout stages without mutating deployment state."""

    def __init__(
        self,
        stage: Optional[int] = None,
        *,
        cooldown_minutes: Optional[int] = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._stage = int(stage if stage is not None else settings.ROLLOUT_STAGE)
        self._cooldown_seconds = int(
            (cooldown_minutes if cooldown_minutes is not None else settings.ROLLOUT_COOLDOWN_MINUTES)
            * 60
        )
        self._clock = clock

    @property
    def stage(self) -> int:
        return max(0, min(3, self._stage))

    def status(self) -> dict[str, Any]:
        return {
            "stage": self.stage,
            "stage_name": ROLLOUT_STAGES[self.stage],
            "environment_updates": self.desired_flags(self.stage),
            "rollback_updates": self.desired_flags(0),
        }

    def desired_flags(self, stage: int) -> dict[str, str]:
        safe_stage = max(0, min(3, int(stage)))
        dashboard_reads = safe_stage >= 1
        report_reads = safe_stage >= 3
        sample_rate = "0.05" if safe_stage >= 2 else "0.10"
        if safe_stage >= 3:
            sample_rate = "0.02"
        return {
            "ROLLOUT_STAGE": str(safe_stage),
            "V3_PROJECTION_DASHBOARD_READS": str(dashboard_reads).lower(),
            "V3_PROJECTION_REPORT_READS": str(report_reads).lower(),
            "SHADOW_READ_ENABLED": "true",
            "SHADOW_READ_SAMPLE_RATE": sample_rate,
        }

    def trigger_next_stage(
        self,
        decision: dict[str, Any],
        *,
        last_change_ts: Optional[float] = None,
    ) -> RolloutPlan:
        if not bool(decision.get("healthy")) or decision.get("decision") != "GO":
            updates = self.desired_flags(self.stage)
            return RolloutPlan(
                status="HELD",
                current_stage=self.stage,
                next_stage=self.stage,
                stage_name=ROLLOUT_STAGES[self.stage],
                environment_updates=updates,
                rollback_updates=self.desired_flags(0),
                reason=str(decision.get("reason") or "decision_not_go"),
                patch_errors=validate_env_patch(
                    updates,
                    current_stage=self.stage,
                    next_stage=self.stage,
                ),
            )

        next_stage = min(self.stage + 1, 3)
        cooldown_remaining = self._cooldown_remaining(last_change_ts)
        if next_stage != self.stage and cooldown_remaining > 0:
            updates = self.desired_flags(self.stage)
            return RolloutPlan(
                status="HELD",
                current_stage=self.stage,
                next_stage=self.stage,
                stage_name=ROLLOUT_STAGES[self.stage],
                environment_updates=updates,
                rollback_updates=self.desired_flags(0),
                reason="rollout_cooldown_active",
                patch_errors=validate_env_patch(
                    updates,
                    current_stage=self.stage,
                    next_stage=self.stage,
                ),
                cooldown_remaining_seconds=cooldown_remaining,
            )
        status = "COMPLETE" if next_stage == self.stage else "READY"
        updates = self.desired_flags(next_stage)
        patch_errors = validate_env_patch(
            updates,
            current_stage=self.stage,
            next_stage=next_stage,
        )
        if patch_errors:
            status = "HELD"
        return RolloutPlan(
            status=status,
            current_stage=self.stage,
            next_stage=next_stage,
            stage_name=ROLLOUT_STAGES[next_stage],
            environment_updates=updates,
            rollback_updates=self.desired_flags(0),
            reason="rollout_stage_ready" if not patch_errors else "invalid_env_patch",
            patch_errors=patch_errors,
        )

    def _cooldown_remaining(self, last_change_ts: Optional[float]) -> float:
        if self._cooldown_seconds <= 0 or last_change_ts is None:
            return 0.0
        elapsed = max(0.0, self._clock() - float(last_change_ts))
        return max(0.0, self._cooldown_seconds - elapsed)
