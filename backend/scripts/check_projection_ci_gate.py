"""Fail CI when a projection parity/readiness report is not release-safe."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def _read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return data


def check_projection_report(report: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    metrics = report.get("metrics") if isinstance(report.get("metrics"), dict) else {}

    if report.get("is_consistent") is not True:
        failures.append("projection parity report is not consistent")
    if int(metrics.get("projection_gap_count") or 0) > 0:
        failures.append("projection parity report contains gaps")
    if int(metrics.get("projection_drift_count") or 0) > 0:
        failures.append("projection parity report contains drift")

    return failures


def check_readiness_report(readiness: dict[str, Any]) -> list[str]:
    if readiness.get("ready") is True or readiness.get("projection_readiness_status") == 1:
        return []
    return ["projection readiness is false"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--report",
        default=".agent/reports/projection-parity-validation.json",
        help="Projection parity JSON report path.",
    )
    parser.add_argument(
        "--readiness-report",
        default=None,
        help="Optional projection readiness JSON report path.",
    )
    args = parser.parse_args()

    failures = check_projection_report(_read_json(Path(args.report)))
    if args.readiness_report:
        failures.extend(check_readiness_report(_read_json(Path(args.readiness_report))))

    if failures:
        for failure in failures:
            print(f"[projection-gate] {failure}")
        return 1

    print("[projection-gate] projection parity/readiness gates passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
