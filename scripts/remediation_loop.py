#!/usr/bin/env python3
"""Resumable, approval-gated remediation workflow for Stock Verify."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = REPO_ROOT / "config" / "remediation_plan.json"
DEFAULT_STATE = REPO_ROOT / ".codex" / "remediation-loop-state.json"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def manifest_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def initial_state(manifest: dict[str, Any], digest: str) -> dict[str, Any]:
    tasks = {
        task["id"]: {"status": "pending", "attempts": 0, "evidence": []}
        for phase in manifest["phases"]
        for task in phase["tasks"]
    }
    return {
        "schema_version": 1,
        "manifest_sha256": digest,
        "created_at": now(),
        "updated_at": now(),
        "approvals": {},
        "tasks": tasks,
    }


def write_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = now()
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


@contextmanager
def state_lock(path: Path) -> Iterator[None]:
    lock = Path(str(path) + ".lock")
    lock.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(descriptor)
    except FileExistsError as exc:
        raise RuntimeError(f"Another remediation process holds {lock}") from exc
    try:
        yield
    finally:
        lock.unlink(missing_ok=True)


def reconcile_state(
    state: dict[str, Any], manifest: dict[str, Any], digest: str, accept_change: bool
) -> dict[str, Any]:
    if state.get("manifest_sha256") == digest:
        return state
    if not accept_change:
        raise RuntimeError(
            "The remediation manifest changed. Review it, then rerun with "
            "--accept-manifest-change to preserve existing progress."
        )
    valid_ids = {task["id"] for phase in manifest["phases"] for task in phase["tasks"]}
    state["tasks"] = {
        task_id: state.get("tasks", {}).get(
            task_id, {"status": "pending", "attempts": 0, "evidence": []}
        )
        for task_id in valid_ids
    }
    state["manifest_sha256"] = digest
    return state


def phase_complete(phase: dict[str, Any], state: dict[str, Any]) -> bool:
    return all(
        state["tasks"][task["id"]]["status"] == "complete" for task in phase["tasks"]
    )


def next_work(
    manifest: dict[str, Any], state: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    for phase in manifest["phases"]:
        if phase_complete(phase, state):
            continue
        for task in phase["tasks"]:
            if state["tasks"][task["id"]]["status"] != "complete":
                return phase, task
    return None


def print_status(manifest: dict[str, Any], state: dict[str, Any]) -> None:
    print(f"{manifest['name']}\n")
    for phase in manifest["phases"]:
        complete = sum(
            state["tasks"][task["id"]]["status"] == "complete"
            for task in phase["tasks"]
        )
        approval = ""
        if phase.get("approval_required"):
            approval = (
                " | approved"
                if phase["id"] in state["approvals"]
                else " | approval required"
            )
        print(
            f"[{complete}/{len(phase['tasks'])}] {phase['id']}: {phase['name']}{approval}"
        )
        for task in phase["tasks"]:
            item = state["tasks"][task["id"]]
            print(f"  - {item['status']:<8} {task['id']}: {task['name']}")


def expand_command(command: list[str]) -> list[str]:
    values = {"python": sys.executable, "repo": str(REPO_ROOT)}
    return [part.format(**values) for part in command]


def run_command_task(
    phase: dict[str, Any],
    task: dict[str, Any],
    state: dict[str, Any],
    dry_run: bool,
    allow_mutations: bool,
) -> int:
    if task.get("mutates"):
        if phase["id"] not in state["approvals"] or not allow_mutations:
            print(
                "BLOCKED: mutating commands require phase approval and --allow-mutations."
            )
            return 2
    commands = [expand_command(command) for command in task.get("commands", [])]
    for command in commands:
        print("DRY RUN:" if dry_run else "RUN:", subprocess.list2cmdline(command))
    if dry_run:
        return 0
    task_state = state["tasks"][task["id"]]
    task_state["status"] = "running"
    task_state["attempts"] += 1
    for command in commands:
        result = subprocess.run(command, cwd=REPO_ROOT, check=False)
        if result.returncode:
            task_state["status"] = "failed"
            task_state["last_error"] = f"Command exited with {result.returncode}"
            return result.returncode
    task_state["status"] = "complete"
    task_state["completed_at"] = now()
    task_state["evidence"].append("All declared validation commands passed")
    task_state.pop("last_error", None)
    return 0


def run_loop(
    manifest: dict[str, Any],
    state: dict[str, Any],
    dry_run: bool,
    max_tasks: int,
    allow_mutations: bool,
) -> int:
    completed = 0
    while completed < max_tasks:
        work = next_work(manifest, state)
        if not work:
            print("COMPLETE: every remediation phase passed.")
            return 0
        phase, task = work
        if phase.get("approval_required") and phase["id"] not in state["approvals"]:
            print(f"BLOCKED: {phase['id']} requires approval before work begins.")
            print(
                f"Approve with: remediation_loop.py approve {phase['id']} --by NAME --reason REASON"
            )
            return 2
        print(f"NEXT: {phase['id']} / {task['id']} — {task['name']}")
        if task["kind"] == "manual":
            print(task["instructions"])
            if task.get("targets"):
                print("Targets:", ", ".join(task["targets"]))
            print(
                f"Complete with: remediation_loop.py complete {task['id']} --evidence DESCRIPTION"
            )
            return 2
        result = run_command_task(phase, task, state, dry_run, allow_mutations)
        if result or dry_run:
            return result
        completed += 1
    return 0


def find_task(
    manifest: dict[str, Any], task_id: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    for phase in manifest["phases"]:
        for task in phase["tasks"]:
            if task["id"] == task_id:
                return phase, task
    raise RuntimeError(f"Unknown task: {task_id}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--accept-manifest-change", action="store_true")
    subparsers = parser.add_subparsers(dest="action", required=True)
    subparsers.add_parser("status")
    run = subparsers.add_parser("run")
    run.add_argument("--dry-run", action="store_true")
    run.add_argument("--max-tasks", type=int, default=1)
    run.add_argument("--allow-mutations", action="store_true")
    complete = subparsers.add_parser("complete")
    complete.add_argument("task_id")
    complete.add_argument("--evidence", required=True)
    approve = subparsers.add_parser("approve")
    approve.add_argument("phase_id")
    approve.add_argument("--by", required=True)
    approve.add_argument("--reason", required=True)
    retry = subparsers.add_parser("retry")
    retry.add_argument("task_id")
    reopen = subparsers.add_parser("reopen")
    reopen.add_argument("task_id")
    reopen.add_argument("--reason", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest_path = args.manifest.resolve()
    state_path = args.state.resolve()
    manifest = load_json(manifest_path)
    digest = manifest_digest(manifest_path)
    try:
        with state_lock(state_path):
            state = (
                load_json(state_path)
                if state_path.exists()
                else initial_state(manifest, digest)
            )
            state = reconcile_state(
                state, manifest, digest, args.accept_manifest_change
            )
            if args.action == "status":
                print_status(manifest, state)
            elif args.action == "run":
                result = run_loop(
                    manifest,
                    state,
                    args.dry_run,
                    max(1, args.max_tasks),
                    args.allow_mutations,
                )
                if not args.dry_run:
                    write_state(state_path, state)
                return result
            elif args.action == "complete":
                phase, task = find_task(manifest, args.task_id)
                if task["kind"] != "manual":
                    raise RuntimeError(
                        "Command tasks must pass their declared commands; they cannot be manually completed."
                    )
                if (
                    phase.get("approval_required")
                    and phase["id"] not in state["approvals"]
                ):
                    raise RuntimeError(
                        f"Approve {phase['id']} before completing its tasks."
                    )
                item = state["tasks"][args.task_id]
                item.update(status="complete", completed_at=now())
                item["evidence"].append(args.evidence)
                item.pop("last_error", None)
                print(f"Completed {args.task_id} with recorded evidence.")
            elif args.action == "approve":
                phase_ids = {phase["id"] for phase in manifest["phases"]}
                if args.phase_id not in phase_ids:
                    raise RuntimeError(f"Unknown phase: {args.phase_id}")
                state["approvals"][args.phase_id] = {
                    "by": args.by,
                    "reason": args.reason,
                    "at": now(),
                }
                print(f"Approved {args.phase_id}.")
            elif args.action == "retry":
                find_task(manifest, args.task_id)
                item = state["tasks"][args.task_id]
                if item["status"] not in {"failed", "running"}:
                    raise RuntimeError(
                        "Only failed or interrupted tasks can be retried."
                    )
                item["status"] = "pending"
                item.pop("last_error", None)
                print(f"Reset {args.task_id} to pending.")
            elif args.action == "reopen":
                find_task(manifest, args.task_id)
                item = state["tasks"][args.task_id]
                previous_status = item["status"]
                if previous_status == "pending":
                    raise RuntimeError(f"{args.task_id} is already pending.")
                item["status"] = "pending"
                item.pop("completed_at", None)
                item.pop("last_error", None)
                item.setdefault("reopened", []).append(
                    {"at": now(), "reason": args.reason, "previous_status": previous_status}
                )
                print(f"Reopened {args.task_id}: {args.reason}")
            write_state(state_path, state)
        return 0
    except (OSError, ValueError, KeyError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
