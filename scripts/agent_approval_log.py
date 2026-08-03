#!/usr/bin/env python3
"""
Append or inspect lightweight approval log entries for risky agent actions.
"""

from __future__ import annotations

import argparse
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_LOG_PATH = Path(".agent/approval-log.jsonl")
MUTATING_STATUSES = {"approved", "rejected", "executed", "completed", "cancelled"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _normalize_scope(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def _build_log_entry(args: argparse.Namespace) -> dict[str, Any]:
    run_id = args.run_id
    call_id = args.call_id

    if args.status == "requested":
        run_id = run_id or _new_id("run")
        call_id = call_id or _new_id("call")
    elif not run_id or not call_id:
        raise SystemExit(
            "--run-id and --call-id are required for statuses other than requested."
        )

    return {
        "timestamp_utc": _utc_now(),
        "run_id": run_id,
        "call_id": call_id,
        "status": args.status,
        "action": args.action,
        "command": args.command,
        "expected_impact": args.impact,
        "scope": _normalize_scope(args.scope),
        "confirmed_by": args.confirmed_by,
        "notes": args.notes,
        "cwd": str(Path.cwd()),
        "source": "codex",
    }


def _append_entry(log_path: Path, entry: dict[str, Any]) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, sort_keys=True) + "\n")


def _read_entries(log_path: Path) -> list[dict[str, Any]]:
    if not log_path.exists():
        return []
    entries: list[dict[str, Any]] = []
    with log_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            entries.append(json.loads(line))
    return entries


def _cmd_log(args: argparse.Namespace) -> int:
    entry = _build_log_entry(args)
    _append_entry(args.log_file, entry)
    print(f"run_id={entry['run_id']}")
    print(f"call_id={entry['call_id']}")
    print(f"log_file={args.log_file}")
    print(f"status={entry['status']}")
    return 0


def _cmd_show(args: argparse.Namespace) -> int:
    entries = _read_entries(args.log_file)

    if args.run_id:
        entries = [entry for entry in entries if entry.get("run_id") == args.run_id]
    if args.status:
        entries = [entry for entry in entries if entry.get("status") == args.status]

    entries = entries[-args.limit :]

    if args.json:
        print(json.dumps(entries, indent=2, sort_keys=True))
        return 0

    for entry in entries:
        scope = ",".join(entry.get("scope", [])) or "-"
        print(
            f"{entry.get('timestamp_utc')} "
            f"{entry.get('status')} "
            f"{entry.get('action')} "
            f"run={entry.get('run_id')} "
            f"call={entry.get('call_id')} "
            f"scope={scope}"
        )
        if entry.get("command"):
            print(f"  command: {entry['command']}")
        if entry.get("expected_impact"):
            print(f"  impact: {entry['expected_impact']}")
        if entry.get("notes"):
            print(f"  notes: {entry['notes']}")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command_name", required=True)

    log_parser = subparsers.add_parser("log", help="Append an approval log entry.")
    log_parser.add_argument(
        "--status",
        required=True,
        choices=[
            "requested",
            "approved",
            "rejected",
            "executed",
            "completed",
            "cancelled",
        ],
    )
    log_parser.add_argument("--action", required=True, help="Short action label.")
    log_parser.add_argument("--command", default=None, help="Command under review or execution.")
    log_parser.add_argument(
        "--impact",
        default=None,
        help="Expected or observed impact of the action.",
    )
    log_parser.add_argument(
        "--scope",
        default=None,
        help="Comma-separated collections, files, or systems affected.",
    )
    log_parser.add_argument("--notes", default=None, help="Optional notes.")
    log_parser.add_argument("--run-id", dest="run_id", default=None)
    log_parser.add_argument("--call-id", dest="call_id", default=None)
    log_parser.add_argument("--confirmed-by", default=None)
    log_parser.add_argument(
        "--log-file",
        type=Path,
        default=DEFAULT_LOG_PATH,
        help="JSONL log path. Defaults to .agent/approval-log.jsonl",
    )
    log_parser.set_defaults(func=_cmd_log)

    show_parser = subparsers.add_parser("show", help="Show recent approval log entries.")
    show_parser.add_argument("--run-id", dest="run_id", default=None)
    show_parser.add_argument(
        "--status",
        default=None,
        choices=sorted({"requested"} | MUTATING_STATUSES),
    )
    show_parser.add_argument("--limit", type=int, default=20)
    show_parser.add_argument("--json", action="store_true")
    show_parser.add_argument(
        "--log-file",
        type=Path,
        default=DEFAULT_LOG_PATH,
        help="JSONL log path. Defaults to .agent/approval-log.jsonl",
    )
    show_parser.set_defaults(func=_cmd_show)

    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
