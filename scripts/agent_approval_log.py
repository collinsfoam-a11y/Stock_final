#!/usr/bin/env python3
"""
Strict approval pipeline CLI for high-risk repository operations.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.approval_pipeline import (  # noqa: E402
    DEFAULT_LOG_PATH,
    ApprovalError,
    append_entry,
    approve_run,
    create_request_entry,
    env_flag,
    finalize_execution,
    log_execution_state,
    normalize_query_filter,
    read_entries,
    reject_run,
    shell_exports,
    validate_execution,
    verify_chain,
)


def cmd_log(args: argparse.Namespace) -> int:
    if args.status != "requested":
        raise ApprovalError("The log command only accepts --status requested.")

    entry = create_request_entry(
        action=args.action,
        command=args.command,
        requested_risk_level=args.risk_level,
        run_id=args.run_id,
        call_id=args.call_id,
        notes=args.notes,
        impact=args.impact,
        scope=args.scope,
        expected_records=args.expected_records,
        query_filter=normalize_query_filter(args.query_filter),
    )
    entry = append_entry(args.log_file, entry)
    print(f"run_id={entry['run_id']}")
    print(f"call_id={entry['call_id']}")
    print(f"risk_level={entry['risk_level']}")
    print(f"execution_hash={entry['execution_hash']}")
    print(f"log_file={args.log_file}")
    return 0


def cmd_approve(args: argparse.Namespace) -> int:
    entry = approve_run(args.log_file, args.run_id, args.approved_by, args.notes)
    print(f"run_id={entry['run_id']}")
    print(f"status={entry['status']}")
    print(f"approved_by={entry['approved_by']}")
    return 0


def cmd_reject(args: argparse.Namespace) -> int:
    entry = reject_run(args.log_file, args.run_id, args.reason, args.rejected_by)
    print(f"run_id={entry['run_id']}")
    print(f"status={entry['status']}")
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    result = validate_execution(
        args.log_file,
        command=args.command,
        run_id=args.run_id,
        execution_hash=args.execution_hash,
        confirm=args.confirm,
    )

    if args.format == "json":
        print(json.dumps(result, indent=2, sort_keys=True))
    elif args.format == "shell":
        print(shell_exports(result))
    else:
        for key in sorted(result):
            print(f"{key}={result[key]}")
    return 0


def cmd_executed(args: argparse.Namespace) -> int:
    entry = log_execution_state(args.log_file, run_id=args.run_id, status="executed", notes=args.notes)
    print(f"run_id={entry['run_id']}")
    print(f"status={entry['status']}")
    return 0


def cmd_finalize(args: argparse.Namespace) -> int:
    output_text = ""
    if args.output_file:
        output_text = args.output_file.read_text(encoding="utf-8")

    result = finalize_execution(
        args.log_file,
        run_id=args.run_id,
        command=args.command,
        execution_hash=args.execution_hash,
        confirm=args.confirm,
        exit_code=args.exit_code,
        output_text=output_text,
    )
    print(f"run_id={result['entry']['run_id']}")
    print(f"status={result['status']}")
    print(json.dumps(result["verification"], sort_keys=True))
    return 0 if result["status"] == "completed" else 1


def cmd_show(args: argparse.Namespace) -> int:
    entries = read_entries(args.log_file)

    if args.run_id:
        entries = [entry for entry in entries if entry["run_id"] == args.run_id]
    if args.status:
        entries = [entry for entry in entries if entry["status"] == args.status]

    entries = entries[-args.limit :]
    if args.json:
        print(json.dumps(entries, indent=2, sort_keys=True))
        return 0

    for entry in entries:
        print(
            f"{entry['timestamp']} "
            f"{entry['status']} "
            f"{entry['action']} "
            f"run={entry['run_id']} "
            f"risk={entry['risk_level']}"
        )
        print(f"  command: {entry['command']}")
        print(f"  approved_by: {entry['approved_by'] or '-'}")
        if entry.get("notes"):
            print(f"  notes: {entry['notes']}")
        if entry.get("verification"):
            print(f"  verification: {json.dumps(entry['verification'], sort_keys=True)}")
    return 0


def cmd_verify_chain(args: argparse.Namespace) -> int:
    result = verify_chain(args.log_file)
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(f"log_file={result['log_file']}")
        print(f"entries={result['entries']}")
        print(f"head_hash={result['head_hash']}")
        print("valid=true")
    return 0


def cmd_guard(args: argparse.Namespace) -> int:
    log_file = args.log_file
    env_log_file = os.getenv("SV_APPROVAL_LOG_FILE")
    if env_log_file:
        log_file = Path(env_log_file)

    command = os.getenv("SV_APPROVAL_COMMAND", "")
    run_id = os.getenv("SV_APPROVAL_RUN_ID")
    execution_hash = os.getenv("SV_APPROVAL_EXECUTION_HASH")
    if os.getenv("SV_APPROVAL_WRAPPER_ACTIVE") != "1" or not command or not run_id or not execution_hash:
        raise ApprovalError(
            "High-risk operation blocked: use ./scripts/run_with_approval.sh for this command."
        )
    result = validate_execution(
        log_file,
        command=command,
        run_id=run_id,
        execution_hash=execution_hash,
        confirm=env_flag("SV_APPROVAL_CONFIRM"),
    )
    if not result["approval_required"]:
        raise ApprovalError("Wrapper context is not bound to an approved high-risk command.")
    print(f"run_id={run_id}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command_name", required=True)

    log_parser = subparsers.add_parser("log", help="Append a requested approval record.")
    log_parser.add_argument("--status", required=True, choices=["requested"])
    log_parser.add_argument("--action", default=None, help="Short action label.")
    log_parser.add_argument("--command", required=True, help="Command under approval.")
    log_parser.add_argument("--risk-level", default=None, choices=["L0", "L1", "L2", "L3", "L4"])
    log_parser.add_argument("--notes", default=None, help="Optional notes.")
    log_parser.add_argument("--impact", default=None, help="Expected impact summary.")
    log_parser.add_argument("--scope", default=None, help="Comma-separated scope summary.")
    log_parser.add_argument("--run-id", dest="run_id", default=None)
    log_parser.add_argument("--call-id", dest="call_id", default=None)
    log_parser.add_argument("--expected-records", type=int, default=0)
    log_parser.add_argument("--query-filter", default=None, help="JSON object describing the filter.")
    log_parser.add_argument("--log-file", type=Path, default=DEFAULT_LOG_PATH)
    log_parser.set_defaults(func=cmd_log)

    approve_parser = subparsers.add_parser("approve", help="Approve a requested run.")
    approve_parser.add_argument("--run-id", required=True)
    approve_parser.add_argument("--approved-by", required=True)
    approve_parser.add_argument("--notes", default="")
    approve_parser.add_argument("--log-file", type=Path, default=DEFAULT_LOG_PATH)
    approve_parser.set_defaults(func=cmd_approve)

    reject_parser = subparsers.add_parser("reject", help="Reject a requested run.")
    reject_parser.add_argument("--run-id", required=True)
    reject_parser.add_argument("--reason", required=True)
    reject_parser.add_argument("--rejected-by", default="")
    reject_parser.add_argument("--log-file", type=Path, default=DEFAULT_LOG_PATH)
    reject_parser.set_defaults(func=cmd_reject)

    validate_parser = subparsers.add_parser("validate", help="Validate approval state before execution.")
    validate_parser.add_argument("--command", required=True)
    validate_parser.add_argument("--run-id", default=None)
    validate_parser.add_argument("--execution-hash", default=None)
    validate_parser.add_argument("--confirm", action="store_true")
    validate_parser.add_argument("--format", choices=["plain", "json", "shell"], default="plain")
    validate_parser.add_argument("--log-file", type=Path, default=DEFAULT_LOG_PATH)
    validate_parser.set_defaults(func=cmd_validate)

    executed_parser = subparsers.add_parser("executed", help="Record that execution has started.")
    executed_parser.add_argument("--run-id", required=True)
    executed_parser.add_argument("--notes", default="")
    executed_parser.add_argument("--log-file", type=Path, default=DEFAULT_LOG_PATH)
    executed_parser.set_defaults(func=cmd_executed)

    finalize_parser = subparsers.add_parser("finalize", help="Record completion or failure.")
    finalize_parser.add_argument("--run-id", required=True)
    finalize_parser.add_argument("--command", required=True)
    finalize_parser.add_argument("--execution-hash", required=True)
    finalize_parser.add_argument("--exit-code", type=int, required=True)
    finalize_parser.add_argument("--confirm", action="store_true")
    finalize_parser.add_argument("--output-file", type=Path, default=None)
    finalize_parser.add_argument("--log-file", type=Path, default=DEFAULT_LOG_PATH)
    finalize_parser.set_defaults(func=cmd_finalize)

    show_parser = subparsers.add_parser("show", help="Show recent approval log entries.")
    show_parser.add_argument("--run-id", default=None)
    show_parser.add_argument("--status", default=None)
    show_parser.add_argument("--limit", type=int, default=20)
    show_parser.add_argument("--json", action="store_true")
    show_parser.add_argument("--log-file", type=Path, default=DEFAULT_LOG_PATH)
    show_parser.set_defaults(func=cmd_show)

    verify_parser = subparsers.add_parser("verify-chain", help="Validate the tamper-resistant hash chain.")
    verify_parser.add_argument("--json", action="store_true")
    verify_parser.add_argument("--log-file", type=Path, default=DEFAULT_LOG_PATH)
    verify_parser.set_defaults(func=cmd_verify_chain)

    guard_parser = subparsers.add_parser("guard", help="Validate wrapper context for direct-entry guards.")
    guard_parser.add_argument("--log-file", type=Path, default=DEFAULT_LOG_PATH)
    guard_parser.set_defaults(func=cmd_guard)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except ApprovalError as exc:
        print(f"ERROR: {exc}", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
