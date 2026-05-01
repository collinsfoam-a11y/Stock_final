#!/usr/bin/env python3
# ruff: noqa: E402
"""Operational commands for shadow validation and projection rollout planning."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from summarize_shadow_logs import summarize_lines

from backend.config import settings
from backend.services.deployment_decision_service import DeploymentDecisionService
from backend.services.deployment_decision_store import DeploymentDecisionStore
from backend.services.rollback_service import RollbackService
from backend.services.rollout_controller import RolloutController, format_env_patch
from backend.services.shadow_monitor_service import (
    ShadowHealth,
    ShadowMonitorService,
    evaluate_shadow_health,
    evaluate_recent_window,
    evaluate_stability_window,
)

DEFAULT_READINESS_REPORT = ROOT / ".agent" / "reports" / "projection-parity-validation.json"


def _read_log_lines(path: str) -> list[str]:
    with Path(path).open("r", encoding="utf-8", errors="replace") as handle:
        return list(handle)


def _health_from_log(path: str) -> dict[str, Any]:
    summary = summarize_lines(_read_log_lines(path))
    health = evaluate_shadow_health(
        {
            "total": summary["total"],
            "mismatch": summary["mismatch_count"],
            "timeout": summary["timeout_count"],
            "error": summary["error_count"],
            "endpoints": summary["endpoints"],
        }
    )
    data = health.to_dict()
    data["endpoints"] = summary["endpoints"]
    data["mismatch_samples"] = summary["mismatch_samples"]
    data["stability"] = evaluate_stability_window(summary["shadow_points"]).to_dict()
    data["recent"] = evaluate_recent_window(summary["shadow_points"]).to_dict()
    return data


async def _health_from_metrics() -> dict[str, Any]:
    monitor = ShadowMonitorService()
    data = (await monitor.evaluate_current_health()).to_dict()
    data["stability"] = (await monitor.evaluate_current_stability()).to_dict()
    data["recent"] = (await monitor.evaluate_current_recent_window()).to_dict()
    return data


async def _get_health(args: argparse.Namespace) -> dict[str, Any]:
    if getattr(args, "log", None):
        return _health_from_log(args.log)
    return await _health_from_metrics()


def _print_json(data: dict[str, Any]) -> None:
    print(json.dumps(data, indent=2, sort_keys=True))


def _shadow_health_from_dict(data: dict[str, Any]) -> ShadowHealth:
    return evaluate_shadow_health(
        {
            "total": data.get("total", 0),
            "mismatch": data.get("mismatch", 0),
            "timeout": data.get("timeout", 0),
            "error": data.get("error", 0),
            "endpoints": data.get("endpoints", {}),
        }
    )


def _readiness_from_report(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        report = json.load(handle)
    if not isinstance(report, dict):
        return {"healthy": False, "reason": "readiness_report_invalid"}
    metrics = report.get("metrics") if isinstance(report.get("metrics"), dict) else {}
    summary = report.get("summary") if isinstance(report.get("summary"), dict) else {}
    lag = metrics.get("projection_lag_seconds", metrics.get("event_lag_seconds"))
    lag_value = float(lag or 0.0)
    timestamp = report.get("timestamp") or metrics.get("timestamp")
    freshness_age_seconds = None
    if isinstance(timestamp, str) and timestamp.strip():
        normalized = timestamp.strip()
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        try:
            from datetime import datetime, timezone

            parsed = datetime.fromisoformat(normalized)
            checked_at = (
                parsed.astimezone(timezone.utc).replace(tzinfo=None)
                if parsed.tzinfo
                else parsed
            )
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            freshness_age_seconds = max(0.0, (now - checked_at).total_seconds())
        except ValueError:
            freshness_age_seconds = None
    ready = (
        report.get("ready") is True
        or report.get("projection_readiness_status") == 1
        or (
            report.get("is_consistent") is True
            and int(metrics.get("projection_gap_count") or 0) == 0
            and int(metrics.get("projection_drift_count") or 0) == 0
            and summary.get("event_lag_ok", True) is True
        )
    )
    if not ready:
        return {"healthy": False, "reason": "projection_readiness_false"}
    if lag_value > float(settings.PROJECTION_MAX_LAG_SECONDS):
        return {
            "healthy": False,
            "reason": "projection_lag_exceeded",
            "lag_seconds": lag_value,
        }
    if (
        freshness_age_seconds is not None
        and freshness_age_seconds > float(settings.PROJECTION_FRESHNESS_SECONDS)
    ):
        return {
            "healthy": False,
            "reason": "projection_freshness_exceeded",
            "lag_seconds": lag_value,
            "freshness_age_seconds": freshness_age_seconds,
        }
    return {
        "healthy": True,
        "reason": "projection_readiness_healthy",
        "lag_seconds": lag_value,
        "freshness_age_seconds": freshness_age_seconds,
    }


async def _readiness_precheck(args: argparse.Namespace) -> dict[str, Any]:
    if getattr(args, "skip_readiness_precheck", False):
        return {"healthy": True, "reason": "operator_skipped_readiness_precheck"}
    report_path = Path(getattr(args, "readiness_report", "") or DEFAULT_READINESS_REPORT)
    if report_path.exists():
        return _readiness_from_report(report_path)
    if not getattr(args, "log", None):
        return (await ShadowMonitorService().evaluate_projection_readiness()).to_dict()
    return {
        "healthy": False,
        "reason": "projection_readiness_evidence_missing",
        "expected_report": str(report_path),
    }


def _guard_reasons(
    *,
    health: dict[str, Any],
    decision: dict[str, Any],
    readiness: dict[str, Any],
    args: argparse.Namespace,
) -> list[str]:
    reasons: list[str] = []
    min_samples = int(getattr(args, "min_samples", settings.SHADOW_MIN_SAMPLES))
    if int(health.get("total", 0) or 0) < min_samples:
        reasons.append(f"insufficient samples ({health.get('total', 0)} < {min_samples})")
    min_endpoint_samples = int(
        getattr(args, "min_samples_per_endpoint", settings.SHADOW_MIN_SAMPLES_PER_ENDPOINT)
    )
    endpoints = health.get("endpoints") if isinstance(health.get("endpoints"), dict) else {}
    for endpoint, stats in sorted(endpoints.items()):
        if not isinstance(stats, dict):
            continue
        endpoint_total = int(stats.get("total", 0) or 0)
        if endpoint_total < min_endpoint_samples:
            reasons.append(
                f"endpoint under-sampled ({endpoint}: {endpoint_total} < {min_endpoint_samples})"
            )
    if not bool(readiness.get("healthy")):
        reasons.append(f"readiness gate not healthy ({readiness.get('reason')})")
    if not bool(decision.get("healthy")):
        reasons.append(str(decision.get("reason") or "shadow_health_not_healthy"))
    if getattr(args, "require_stable_window", False) or getattr(args, "window_complete", False):
        stability = health.get("stability") if isinstance(health.get("stability"), dict) else {}
        if not bool(stability.get("stable")):
            reasons.append(f"stability window not met ({stability.get('reason')})")
    recent = health.get("recent") if isinstance(health.get("recent"), dict) else {}
    if recent and not bool(recent.get("healthy")):
        reasons.append(f"recent window unhealthy ({recent.get('reason')})")
    return reasons


def _print_env_block(title: str, updates: dict[str, str]) -> None:
    print(f"--- {title} ---")
    patch = format_env_patch(updates)
    if patch:
        print(patch)
    else:
        print("# no environment changes recommended")
    print("--- END ---")


def _print_rollout_text(payload: dict[str, Any]) -> None:
    health = payload["shadow_health"]
    rollout = payload["rollout"]
    print("DEPLOYMENT STATUS")
    print()
    print("Shadow Health:")
    print(f"- mismatch_rate: {health['mismatch_rate']:.4%}")
    print(f"- timeout_rate: {health['timeout_rate']:.4%}")
    print(f"- error_rate: {health['error_rate']:.4%}")
    print()
    print("Decision:")
    print(f"- {payload['decision']['decision']}")
    if payload.get("guard_reasons"):
        for reason in payload["guard_reasons"]:
            print(f"- NO-GO: {reason}")
    print()
    print("Rollout Stage:")
    print(f"- {rollout['current_stage']} -> {rollout['next_stage']} ({rollout['stage_name']})")
    print()
    print("System State:")
    print(f"- {rollout['status']}")
    if rollout.get("patch_errors"):
        for error in rollout["patch_errors"]:
            print(f"- PATCH ERROR: {error}")
    print()
    _print_env_block("APPLY THESE CHANGES", rollout["environment_updates"])
    _print_env_block("ROLLBACK", rollout["rollback_updates"])


def _print_rollback_text(payload: dict[str, Any]) -> None:
    rollback = payload["rollback"]
    print("DEPLOYMENT STATUS")
    print()
    print("System State:")
    print(f"- {rollback['state']}")
    print(f"- reason: {rollback['reason']}")
    print()
    _print_env_block("ROLLBACK", rollback["environment_updates"])


def _record(
    args: argparse.Namespace,
    *,
    kind: str,
    decision: str,
    reason: str,
    metrics: dict[str, Any],
    payload: dict[str, Any],
) -> None:
    if getattr(args, "no_record", False):
        return
    DeploymentDecisionStore(getattr(args, "decision_store", None)).record(
        kind=kind,
        decision=decision,
        reason=reason,
        metrics=metrics,
        payload=payload,
    )


async def shadow_status(args: argparse.Namespace) -> int:
    health = await _get_health(args)
    decision = "GO" if health["healthy"] else "NO-GO"
    payload = {
        "shadow_health": health,
        "decision": decision,
    }
    _record(
        args,
        kind="shadow_status",
        decision=decision,
        reason=str(health.get("reason") or ""),
        metrics=health,
        payload=payload,
    )
    _print_json(payload)
    return 0 if health["healthy"] else 1 if args.fail_on_no_go else 0


async def rollout_status(_args: argparse.Namespace) -> int:
    _print_json({"rollout": RolloutController().status()})
    return 0


async def trigger_rollout(args: argparse.Namespace) -> int:
    health = await _get_health(args)
    readiness = await _readiness_precheck(args)
    decision_service = DeploymentDecisionService(required_window_seconds=args.window_seconds)
    stability = health.get("stability") if isinstance(health.get("stability"), dict) else {}
    if bool(stability.get("stable")) and health["healthy"]:
        decision = {
            "decision": "GO",
            "healthy": True,
            "reason": "shadow_stability_window_satisfied",
            "metrics": health,
        }
    else:
        decision = decision_service.evaluate_health(_shadow_health_from_dict(health)).to_dict()

    guard_reasons = _guard_reasons(
        health=health,
        decision=decision,
        readiness=readiness,
        args=args,
    )
    if guard_reasons:
        decision = {
            **decision,
            "decision": "NO-GO",
            "healthy": False,
            "reason": guard_reasons[0],
        }

    store = DeploymentDecisionStore(args.decision_store)
    plan = RolloutController().trigger_next_stage(
        decision,
        last_change_ts=store.last_stage_change_ts(),
    ).to_dict()
    payload = {
        "shadow_health": health,
        "readiness": readiness,
        "decision": decision,
        "guard_reasons": guard_reasons,
        "rollout": plan,
        "mode": "dry_run",
    }
    _record(
        args,
        kind="rollout_plan",
        decision=decision["decision"],
        reason=str(decision.get("reason") or ""),
        metrics=health,
        payload=payload,
    )
    if args.json:
        _print_json(payload)
    else:
        _print_rollout_text(payload)
    return 0 if plan["status"] in {"READY", "COMPLETE"} else 1 if args.fail_on_hold else 0


async def rollback(args: argparse.Namespace) -> int:
    health = await _get_health(args)
    plan = RollbackService().evaluate(_shadow_health_from_dict(health))
    payload = {
        "shadow_health": health,
        "rollback": plan.to_dict(),
        "mode": "dry_run",
    }
    _record(
        args,
        kind="rollback_plan",
        decision="ROLLBACK" if plan.triggered else "STABLE",
        reason=plan.reason,
        metrics=health,
        payload=payload,
    )
    if args.json:
        _print_json(payload)
    else:
        _print_rollback_text(payload)
    return 0 if plan.triggered else 1 if args.fail_when_stable else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)

    shadow_parser = subcommands.add_parser("shadow-status")
    shadow_parser.add_argument("--log", help="Evaluate from a log file instead of live metrics.")
    shadow_parser.add_argument("--fail-on-no-go", action="store_true")
    shadow_parser.add_argument("--decision-store")
    shadow_parser.add_argument("--no-record", action="store_true")
    shadow_parser.set_defaults(func=shadow_status)

    rollout_status_parser = subcommands.add_parser("rollout-status")
    rollout_status_parser.set_defaults(func=rollout_status)

    trigger_parser = subcommands.add_parser("trigger-rollout")
    trigger_parser.add_argument("--log", help="Evaluate from a log file instead of live metrics.")
    trigger_parser.add_argument("--readiness-report")
    trigger_parser.add_argument("--skip-readiness-precheck", action="store_true")
    trigger_parser.add_argument("--decision-store")
    trigger_parser.add_argument("--no-record", action="store_true")
    trigger_parser.add_argument("--json", action="store_true")
    trigger_parser.add_argument(
        "--min-samples",
        type=int,
        default=settings.SHADOW_MIN_SAMPLES,
        help="Minimum shadow samples required before planning rollout.",
    )
    trigger_parser.add_argument(
        "--min-samples-per-endpoint",
        type=int,
        default=settings.SHADOW_MIN_SAMPLES_PER_ENDPOINT,
        help="Minimum shadow samples required for each active endpoint.",
    )
    trigger_parser.add_argument("--require-stable-window", action="store_true")
    trigger_parser.add_argument(
        "--window-seconds",
        type=int,
        default=settings.SHADOW_DECISION_WINDOW_SECONDS,
        help="Required continuous healthy window. Default: 7200.",
    )
    trigger_parser.add_argument(
        "--window-complete",
        action="store_true",
        help="Operator confirmation that the provided log covers the required healthy window.",
    )
    trigger_parser.add_argument("--fail-on-hold", action="store_true")
    trigger_parser.set_defaults(func=trigger_rollout)

    rollback_parser = subcommands.add_parser("rollback")
    rollback_parser.add_argument("--log", help="Evaluate from a log file instead of live metrics.")
    rollback_parser.add_argument("--decision-store")
    rollback_parser.add_argument("--no-record", action="store_true")
    rollback_parser.add_argument("--json", action="store_true")
    rollback_parser.add_argument("--fail-when-stable", action="store_true")
    rollback_parser.set_defaults(func=rollback)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
