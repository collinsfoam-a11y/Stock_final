import argparse
import importlib.util
import sys
from datetime import datetime, timedelta
from pathlib import Path

from backend.services.deployment_decision_service import DeploymentDecisionService
from backend.services.deployment_decision_store import DeploymentDecisionStore
from backend.services.rollback_service import RollbackService
from backend.services.rollout_controller import RolloutController
from backend.services.shadow_monitor_service import (
    ShadowWindowPoint,
    ShadowStats,
    ShadowMonitorService,
    evaluate_shadow_health,
    evaluate_recent_window,
    evaluate_stability_window,
)

MANAGE_PATH = Path(__file__).resolve().parents[2] / "manage.py"
MANAGE_SPEC = importlib.util.spec_from_file_location("manage", MANAGE_PATH)
manage = importlib.util.module_from_spec(MANAGE_SPEC)
assert MANAGE_SPEC and MANAGE_SPEC.loader
sys.modules[MANAGE_SPEC.name] = manage
MANAGE_SPEC.loader.exec_module(manage)


def test_shadow_health_requires_data_and_enforces_thresholds():
    assert not evaluate_shadow_health({"total": 0}).healthy

    healthy = evaluate_shadow_health(
        {"total": 10_000, "mismatch": 1, "timeout": 2, "error": 0}
    )
    noisy = evaluate_shadow_health(
        {"total": 1_000, "mismatch": 2, "timeout": 0, "error": 0}
    )

    assert healthy.healthy is True
    assert noisy.healthy is False
    assert noisy.reason == "mismatch_rate_exceeded"


def test_stability_window_requires_continuous_healthy_points():
    start = datetime(2026, 5, 1, 8, 0, 0)
    healthy_points = [
        ShadowWindowPoint(ts=start + timedelta(minutes=5 * idx), healthy=True, total=10)
        for idx in range(25)
    ]
    unhealthy_points = [
        *healthy_points[:12],
        ShadowWindowPoint(ts=start + timedelta(minutes=60), healthy=False, total=10),
        *healthy_points[13:],
    ]

    assert evaluate_stability_window(healthy_points).stable is True
    unstable = evaluate_stability_window(unhealthy_points)
    assert unstable.stable is False
    assert unstable.reason == "unhealthy_point_in_stability_window"


def test_recent_window_spike_blocks_go_guard():
    start = datetime(2026, 5, 1, 8, 0, 0)
    points = [
        ShadowWindowPoint(ts=start + timedelta(minutes=5 * idx), healthy=True, total=1)
        for idx in range(25)
    ]
    points.append(
        ShadowWindowPoint(
            ts=start + timedelta(minutes=125),
            healthy=False,
            total=1,
            reason="mismatch",
        )
    )

    recent = evaluate_recent_window(points, recent_window_minutes=15)
    reasons = manage._guard_reasons(
        health={
            "total": 1_000,
            "healthy": True,
            "stability": {"stable": True},
            "recent": recent.to_dict(),
            "endpoints": {"dashboard.stats": {"total": 500}},
        },
        decision={"healthy": True, "decision": "GO"},
        readiness={"healthy": True},
        args=argparse.Namespace(
            min_samples=500,
            min_samples_per_endpoint=50,
            require_stable_window=True,
            window_complete=False,
        ),
    )

    assert "recent window unhealthy (recent_mismatch_rate_exceeded)" in reasons


def test_future_skewed_stability_points_are_discarded():
    now = datetime(2026, 5, 1, 8, 0, 0)
    points = [
        ShadowWindowPoint(ts=now, healthy=True, total=1),
        ShadowWindowPoint(ts=now + timedelta(seconds=10), healthy=True, total=1),
    ]

    stability = evaluate_stability_window(
        points,
        min_window_minutes=1,
        eval_interval_seconds=60,
        now=now,
        max_clock_skew_seconds=5,
    )

    assert stability.discarded_points == 1


async def test_shadow_monitor_aggregates_endpoint_counters():
    async def metrics_provider():
        return {
            "counters": {
                'shadow_total_requests{endpoint="dashboard.stats"}': 10,
                'shadow_mismatch_count{endpoint="dashboard.stats"}': 1,
                'shadow_timeout_count{endpoint="report.variance"}': 2,
                'shadow_error_count{endpoint="report.variance"}': 1,
            }
        }

    stats = await ShadowMonitorService(metrics_provider).get_shadow_stats()

    assert stats.total == 10
    assert stats.mismatch == 1
    assert stats.timeout == 2
    assert stats.error == 1
    assert stats.endpoints["dashboard.stats"].total == 10
    assert stats.endpoints["report.variance"].error == 1


async def test_deployment_decision_requires_continuous_window():
    current_time = 100.0

    def clock():
        return current_time

    service = DeploymentDecisionService(
        required_window_seconds=120,
        clock=clock,
    )
    health = evaluate_shadow_health(ShadowStats(total=100, mismatch=0, timeout=0, error=0))

    first = service.evaluate_health(health)
    current_time = 221.0
    second = service.evaluate_health(health)

    assert first.decision == "NO-GO"
    assert first.reason == "shadow_health_window_pending"
    assert second.decision == "GO"
    assert second.reason == "shadow_health_window_satisfied"


def test_endpoint_specific_failure_blocks_go_decision():
    health = evaluate_shadow_health(
        {
            "total": 10_000,
            "mismatch": 1,
            "timeout": 0,
            "error": 0,
            "endpoints": {
                "bad.endpoint": {"total": 10, "mismatch": 1, "timeout": 0, "error": 0}
            },
        }
    )
    decision = DeploymentDecisionService(required_window_seconds=0).evaluate_health(health)

    assert decision.decision == "NO-GO"
    assert decision.reason == "endpoint_specific_mismatch:bad.endpoint"


def test_min_sample_guard_blocks_rollout():
    reasons = manage._guard_reasons(
        health={"total": 312, "healthy": True, "stability": {"stable": True}},
        decision={"healthy": True, "decision": "GO"},
        readiness={"healthy": True},
        args=argparse.Namespace(
            min_samples=500,
            require_stable_window=True,
            window_complete=False,
        ),
    )

    assert "insufficient samples (312 < 500)" in reasons


def test_min_samples_per_endpoint_guard_blocks_rollout():
    reasons = manage._guard_reasons(
        health={
            "total": 1_000,
            "healthy": True,
            "stability": {"stable": True},
            "recent": {"healthy": True},
            "endpoints": {"report.variance": {"total": 49}},
        },
        decision={"healthy": True, "decision": "GO"},
        readiness={"healthy": True},
        args=argparse.Namespace(
            min_samples=500,
            min_samples_per_endpoint=50,
            require_stable_window=True,
            window_complete=False,
        ),
    )

    assert "endpoint under-sampled (report.variance: 49 < 50)" in reasons


def test_rollout_controller_holds_without_go_decision():
    plan = RolloutController(stage=1).trigger_next_stage(
        {"decision": "NO-GO", "healthy": False, "reason": "no_shadow_data"}
    )

    assert plan.status == "HELD"
    assert plan.next_stage == 1
    assert plan.environment_updates["V3_PROJECTION_DASHBOARD_READS"] == "true"


def test_rollout_controller_advances_on_go_decision():
    plan = RolloutController(stage=0).trigger_next_stage(
        {"decision": "GO", "healthy": True, "reason": "ready"}
    )

    assert plan.status == "READY"
    assert plan.next_stage == 1
    assert plan.environment_updates["V3_PROJECTION_DASHBOARD_READS"] == "true"
    assert plan.environment_updates["V3_PROJECTION_REPORT_READS"] == "false"


def test_rollout_cooldown_prevents_second_rollout():
    plan = RolloutController(
        stage=1,
        cooldown_minutes=30,
        clock=lambda: 1_000.0,
    ).trigger_next_stage(
        {"decision": "GO", "healthy": True, "reason": "ready"},
        last_change_ts=900.0,
    )

    assert plan.status == "HELD"
    assert plan.reason == "rollout_cooldown_active"
    assert plan.cooldown_remaining_seconds == 1_700.0


def test_rollback_service_triggers_on_risk():
    health = evaluate_shadow_health(
        {"total": 1_000, "mismatch": 10, "timeout": 0, "error": 0}
    )
    plan = RollbackService(mismatch_spike_rate=0.005).evaluate(health)

    assert plan.triggered is True
    assert plan.state == "ROLLED_BACK"
    assert plan.environment_updates["V3_PROJECTION_DASHBOARD_READS"] == "true"
    assert plan.environment_updates["V3_PROJECTION_REPORT_READS"] == "true"


def test_rollout_text_includes_exact_apply_and_rollback_patches(capsys):
    plan = RolloutController(stage=0, cooldown_minutes=0).trigger_next_stage(
        {"decision": "GO", "healthy": True, "reason": "ready"}
    )
    manage._print_rollout_text(
        {
            "shadow_health": {
                "mismatch_rate": 0.0,
                "timeout_rate": 0.0,
                "error_rate": 0.0,
            },
            "decision": {"decision": "GO"},
            "guard_reasons": [],
            "rollout": plan.to_dict(),
        }
    )

    output = capsys.readouterr().out
    assert "--- APPLY THESE CHANGES ---" in output
    assert "# checksum:" in output
    assert "V3_PROJECTION_DASHBOARD_READS=true" in output
    assert "--- ROLLBACK ---" in output
    assert "V3_PROJECTION_DASHBOARD_READS=true" in output


def test_decision_store_persists_recent_records(tmp_path):
    store = DeploymentDecisionStore(tmp_path / "decisions.jsonl", history_limit=2)
    store.record(
        kind="shadow_status",
        decision="NO-GO",
        reason="pending",
        metrics={"total": 1},
        payload={},
    )
    store.record(
        kind="rollout_plan",
        decision="GO",
        reason="ready",
        metrics={"total": 2},
        payload={"rollout": {"status": "READY"}},
    )

    records = store.load_recent()
    assert len(records) == 2
    assert records[-1]["decision"] == "GO"
    assert store.last_stage_change_ts() is not None
