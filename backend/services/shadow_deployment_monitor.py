"""Background shadow decision monitor."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from backend.config import settings
from backend.services.deployment_decision_service import DeploymentDecisionService
from backend.services.deployment_decision_store import DeploymentDecisionStore
from backend.services.rollback_service import RollbackService
from backend.services.rollout_controller import RolloutController

logger = logging.getLogger(__name__)


class ShadowDeploymentMonitor:
    """Periodically evaluate shadow health and log rollout/rollback decisions."""

    def __init__(
        self,
        *,
        decision_service: Optional[DeploymentDecisionService] = None,
        rollout_controller: Optional[RolloutController] = None,
        rollback_service: Optional[RollbackService] = None,
        decision_store: Optional[DeploymentDecisionStore] = None,
        interval_seconds: Optional[int] = None,
    ) -> None:
        self._decision_service = decision_service or DeploymentDecisionService()
        self._rollout_controller = rollout_controller or RolloutController()
        self._rollback_service = rollback_service or RollbackService()
        self._decision_store = decision_store or DeploymentDecisionStore()
        self._interval_seconds = int(
            interval_seconds
            if interval_seconds is not None
            else settings.SHADOW_MONITOR_INTERVAL_SECONDS
        )
        self._last_alert_by_reason: dict[str, float] = {}
        self._task: Optional[asyncio.Task[None]] = None
        self._stopped = asyncio.Event()

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stopped.clear()
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stopped.set()
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass

    async def tick(self) -> dict[str, object]:
        health, decision = await self._decision_service.get_health_and_decision()
        metrics = decision.metrics
        rollback_plan = self._rollback_service.evaluate(health)
        rollout_plan = self._rollout_controller.trigger_next_stage(
            decision.to_dict(),
            last_change_ts=self._decision_store.last_stage_change_ts(),
        )
        status = {
            "decision": decision.to_dict(),
            "rollout": rollout_plan.to_dict(),
            "rollback": rollback_plan.to_dict(),
        }
        self._decision_store.record(
            kind="background_decision",
            decision=decision.decision,
            reason=decision.reason,
            metrics=metrics,
            payload=status,
        )
        logger.info(
            "shadow_deployment_decision",
            extra={
                "decision": decision.decision,
                "reason": decision.reason,
                "rollout_status": rollout_plan.status,
                "rollback_triggered": rollback_plan.triggered,
                "mismatch_rate": metrics["mismatch_rate"],
                "timeout_rate": metrics["timeout_rate"],
                "error_rate": metrics["error_rate"],
            },
        )
        if rollback_plan.triggered and self._should_emit_alert(rollback_plan.reason):
            logger.critical(
                "shadow_deployment_alert",
                extra={
                    "reason": rollback_plan.reason,
                    "recommended_action": "apply_rollback_patch",
                    "recommended_rollback_patch": rollback_plan.to_dict()["rollback_patch"],
                },
            )
        return status

    def _should_emit_alert(self, reason: str) -> bool:
        dedupe_seconds = int(settings.SHADOW_ALERT_DEDUPE_SECONDS)
        now = time.time()
        last_alert = self._last_alert_by_reason.get(reason)
        if last_alert is not None and now - last_alert < dedupe_seconds:
            return False
        self._last_alert_by_reason[reason] = now
        return True

    async def _run(self) -> None:
        while not self._stopped.is_set():
            try:
                await self.tick()
            except (RuntimeError, TypeError, ValueError, OSError) as exc:
                logger.warning(
                    "shadow_deployment_monitor_failed",
                    extra={"error": str(exc), "error_type": type(exc).__name__},
                )
            try:
                await asyncio.wait_for(
                    self._stopped.wait(),
                    timeout=self._interval_seconds,
                )
            except asyncio.TimeoutError:
                continue
