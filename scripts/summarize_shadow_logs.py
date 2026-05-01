#!/usr/bin/env python3
"""Summarize shadow-read validation logs by endpoint."""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from backend.config import settings

EVENT_NAMES = (
    "shadow_compare_unhandled",
    "shadow_compare_mismatch",
    "shadow_compare_failed",
    "shadow_compare_started",
    "shadow_compare",
)
FIELD_NAMES = {
    "timestamp",
    "ts",
    "time",
    "@timestamp",
    "request_id",
    "shadow_id",
    "endpoint",
    "params_hash",
    "status",
    "error_type",
    "items_diff",
    "summary_diffs",
}
TIMESTAMP_RE = re.compile(
    r"(?P<ts>\d{4}-\d{2}-\d{2}[T ][0-2]\d:[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)"
)
KEY_VALUE_RE = re.compile(
    r"(?P<key>request_id|shadow_id|endpoint|params_hash|status|error_type)"
    r"=(?P<quote>['\"]?)(?P<value>[^'\"\s,}]+)(?P=quote)"
)


@dataclass
class ShadowEvent:
    event: str
    endpoint: str
    shadow_id: str
    timestamp: str = ""
    request_id: str = ""
    params_hash: str = ""
    status: str = ""
    error_type: str = ""
    items_diff: Any = field(default_factory=list)
    summary_diffs: Any = field(default_factory=list)


@dataclass
class ShadowState:
    shadow_id: str
    endpoint: str = "unknown"
    request_id: str = ""
    params_hash: str = ""
    started: bool = False
    completed: bool = False
    mismatch: bool = False
    timeout: bool = False
    error: bool = False
    items_diff: Any = field(default_factory=list)
    summary_diffs: Any = field(default_factory=list)
    timestamp: str = ""


def _event_name(value: Any) -> str | None:
    text = str(value or "")
    for event_name in EVENT_NAMES:
        if event_name in text:
            return event_name
    return None


def _parse_ts(value: Any) -> datetime | None:
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


def _ts_text(value: Any) -> str:
    parsed = _parse_ts(value)
    if parsed is None:
        return ""
    return parsed.isoformat() + "Z"


def _flatten_mapping(value: dict[str, Any]) -> dict[str, Any]:
    data: dict[str, Any] = {}
    extra = value.get("extra")
    if isinstance(extra, dict):
        data.update(extra)
    for key in FIELD_NAMES:
        if key in value:
            data[key] = value[key]
    event = _event_name(value.get("event")) or _event_name(value.get("message"))
    if event:
        data["event"] = event
    return data


def _parse_mapping_payload(line: str) -> dict[str, Any]:
    start = line.find("{")
    end = line.rfind("}")
    if start < 0 or end <= start:
        return {}
    payload = line[start : end + 1]
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError:
        try:
            parsed = ast.literal_eval(payload)
        except (SyntaxError, ValueError, TypeError):
            return {}
    return _flatten_mapping(parsed) if isinstance(parsed, dict) else {}


def _parse_json_line(line: str) -> dict[str, Any]:
    try:
        parsed = json.loads(line)
    except json.JSONDecodeError:
        return {}
    return _flatten_mapping(parsed) if isinstance(parsed, dict) else {}


def _parse_text_line(line: str) -> dict[str, Any]:
    event = _event_name(line)
    if not event:
        return {}
    data = _parse_mapping_payload(line)
    data["event"] = event
    timestamp_match = TIMESTAMP_RE.search(line)
    if timestamp_match:
        data["timestamp"] = timestamp_match.group("ts")
    for match in KEY_VALUE_RE.finditer(line):
        data[match.group("key")] = match.group("value")
    return data


def parse_shadow_event(line: str, line_number: int) -> ShadowEvent | None:
    data = _parse_json_line(line) or _parse_text_line(line)
    event = _event_name(data.get("event"))
    if not event:
        return None

    endpoint = str(data.get("endpoint") or "unknown")
    request_id = str(data.get("request_id") or "")
    params_hash = str(data.get("params_hash") or "")
    shadow_id = str(
        data.get("shadow_id")
        or (f"{endpoint}:{request_id}:{params_hash}" if request_id or params_hash else "")
        or f"line:{line_number}"
    )
    return ShadowEvent(
        event=event,
        endpoint=endpoint,
        shadow_id=shadow_id,
        timestamp=_ts_text(
            data.get("timestamp")
            or data.get("ts")
            or data.get("time")
            or data.get("@timestamp")
        ),
        request_id=request_id,
        params_hash=params_hash,
        status=str(data.get("status") or ""),
        error_type=str(data.get("error_type") or ""),
        items_diff=data.get("items_diff") or [],
        summary_diffs=data.get("summary_diffs") or [],
    )


def summarize_lines(lines: Iterable[str]) -> dict[str, Any]:
    states: dict[str, ShadowState] = {}
    for line_number, line in enumerate(lines, start=1):
        event = parse_shadow_event(line, line_number)
        if not event:
            continue

        state = states.setdefault(event.shadow_id, ShadowState(shadow_id=event.shadow_id))
        state.endpoint = event.endpoint or state.endpoint
        state.request_id = event.request_id or state.request_id
        state.params_hash = event.params_hash or state.params_hash
        state.timestamp = event.timestamp or state.timestamp
        if event.event == "shadow_compare_started":
            state.started = True
        elif event.event == "shadow_compare":
            state.completed = True
            state.mismatch = state.mismatch or event.status == "mismatch"
        elif event.event == "shadow_compare_mismatch":
            state.mismatch = True
            state.items_diff = event.items_diff or state.items_diff
            state.summary_diffs = event.summary_diffs or state.summary_diffs
        elif event.event == "shadow_compare_failed":
            if event.error_type == "timeout":
                state.timeout = True
            else:
                state.error = True
        elif event.event == "shadow_compare_unhandled":
            state.error = True

    endpoint_stats: dict[str, dict[str, int]] = defaultdict(
        lambda: {"total": 0, "mismatch": 0, "timeout": 0, "error": 0}
    )
    mismatch_samples: list[dict[str, Any]] = []
    shadow_points: list[dict[str, Any]] = []
    for state in states.values():
        stats = endpoint_stats[state.endpoint]
        stats["total"] += 1
        if state.mismatch:
            stats["mismatch"] += 1
            if len(mismatch_samples) < 10:
                mismatch_samples.append(
                    {
                        "shadow_id": state.shadow_id,
                        "request_id": state.request_id,
                        "endpoint": state.endpoint,
                        "params_hash": state.params_hash,
                        "items_diff": state.items_diff,
                        "summary_diffs": state.summary_diffs,
                    }
                )
        if state.timeout:
            stats["timeout"] += 1
        if state.error:
            stats["error"] += 1
        if state.timestamp:
            shadow_points.append(
                {
                    "ts": state.timestamp,
                    "healthy": not (state.mismatch or state.timeout or state.error),
                    "total": 1,
                    "reason": (
                        "mismatch"
                        if state.mismatch
                        else "timeout"
                        if state.timeout
                        else "error"
                        if state.error
                        else "healthy"
                    ),
                }
            )

    total = len(states)
    mismatch_count = sum(1 for state in states.values() if state.mismatch)
    timeout_count = sum(1 for state in states.values() if state.timeout)
    error_count = sum(1 for state in states.values() if state.error)
    return {
        "total": total,
        "mismatch_count": mismatch_count,
        "timeout_count": timeout_count,
        "error_count": error_count,
        "mismatch_rate": mismatch_count / total if total else 0.0,
        "timeout_rate": timeout_count / total if total else 0.0,
        "error_rate": error_count / total if total else 0.0,
        "endpoints": dict(sorted(endpoint_stats.items())),
        "mismatch_samples": mismatch_samples,
        "shadow_points": sorted(shadow_points, key=lambda point: point["ts"]),
    }


def _iter_input(paths: list[str]) -> Iterable[str]:
    if not paths or paths == ["-"]:
        yield from sys.stdin
        return
    for raw_path in paths:
        if raw_path == "-":
            yield from sys.stdin
            continue
        with Path(raw_path).open("r", encoding="utf-8", errors="replace") as handle:
            yield from handle


def _rate(value: float) -> str:
    return f"{value:.3%}"


def _passes_thresholds(
    summary: dict[str, Any],
    *,
    max_mismatch_rate: float,
    max_timeout_rate: float,
    max_error_rate: float,
) -> bool:
    return (
        summary["total"] > 0
        and summary["mismatch_rate"] < max_mismatch_rate
        and summary["timeout_rate"] < max_timeout_rate
        and summary["error_rate"] <= max_error_rate
    )


def print_text_summary(summary: dict[str, Any], decision: str) -> None:
    print("SHADOW READ SUMMARY")
    print(f"Total shadow requests: {summary['total']}")
    print(
        f"Mismatch count: {summary['mismatch_count']} "
        f"(rate {_rate(summary['mismatch_rate'])})"
    )
    print(f"Timeout count: {summary['timeout_count']} (rate {_rate(summary['timeout_rate'])})")
    print(f"Error count: {summary['error_count']} (rate {_rate(summary['error_rate'])})")
    print()
    print("Endpoints:")
    for endpoint, stats in summary["endpoints"].items():
        print(
            f"- {endpoint}: total={stats['total']} mismatch={stats['mismatch']} "
            f"timeout={stats['timeout']} error={stats['error']}"
        )
    if summary["mismatch_samples"]:
        print()
        print("Mismatch samples:")
        for sample in summary["mismatch_samples"]:
            print(
                f"- shadow_id={sample['shadow_id']} endpoint={sample['endpoint']} "
                f"params_hash={sample['params_hash']}"
            )
            if sample["items_diff"]:
                print(f"  items_diff={sample['items_diff']}")
            if sample["summary_diffs"]:
                print(f"  summary_diffs={sample['summary_diffs']}")
    print()
    print(f"Decision: {decision}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "paths",
        nargs="*",
        help="Log files to summarize. Use '-' or omit paths to read stdin.",
    )
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")
    parser.add_argument(
        "--max-mismatch-rate",
        type=float,
        default=float(settings.SHADOW_MISMATCH_THRESHOLD),
        help="GO threshold for mismatch rate. Default: 0.001 (0.1%%).",
    )
    parser.add_argument(
        "--max-timeout-rate",
        type=float,
        default=float(settings.SHADOW_TIMEOUT_THRESHOLD),
        help="GO threshold for timeout rate. Default: 0.01 (1%%).",
    )
    parser.add_argument(
        "--max-error-rate",
        type=float,
        default=float(settings.SHADOW_ERROR_THRESHOLD),
        help="GO threshold for error rate. Default: 0.",
    )
    parser.add_argument(
        "--fail-on-threshold",
        action="store_true",
        help="Exit non-zero when the summary is NO-GO.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    summary = summarize_lines(_iter_input(args.paths))
    passed = _passes_thresholds(
        summary,
        max_mismatch_rate=args.max_mismatch_rate,
        max_timeout_rate=args.max_timeout_rate,
        max_error_rate=args.max_error_rate,
    )
    decision = "GO" if passed else "NO-GO"

    if args.json:
        print(json.dumps({**summary, "decision": decision}, indent=2, sort_keys=True))
    else:
        print_text_summary(summary, decision)
    return 1 if args.fail_on_threshold and not passed else 0


if __name__ == "__main__":
    raise SystemExit(main())
