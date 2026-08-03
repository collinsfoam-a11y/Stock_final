#!/usr/bin/env python3
"""Run the read-only evidence collection phase of the Stock Verify audit loop.

The runner deliberately keeps going after individual failures so one execution
produces a useful cross-stack evidence bundle. It never starts the application,
connects to MongoDB or SQL Server, or runs repair/migration commands.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import sys
import time
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
PROFILE_RANK = {"quick": 0, "standard": 1, "deep": 2}
SOURCE_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".cjs", ".mjs", ".go", ".swift"}
INVENTORY_ROOTS = ("backend", "frontend/src", "frontend/app", "scripts")


@dataclass(frozen=True)
class Check:
    name: str
    stage: str
    description: str
    command: tuple[str, ...]
    cwd: str = "."
    minimum_profile: str = "quick"
    required: bool = True
    warning_exit_codes: tuple[int, ...] = ()
    blocked_exit_codes: tuple[int, ...] = ()
    uses_network: bool = False


CHECKS: tuple[Check, ...] = (
    Check(
        name="repository-hygiene",
        stage="preflight",
        description="Reject tracked build, cache, database, and secret artifacts.",
        command=("bash", "scripts/check_repo_hygiene.sh"),
    ),
    Check(
        name="git-diff-integrity",
        stage="preflight",
        description="Detect whitespace errors and unresolved conflict markers in the current diff.",
        command=("git", "diff", "--check"),
    ),
    Check(
        name="basic-repository-health",
        stage="preflight",
        description="Check required manifests and local environment-file hygiene.",
        command=("./scripts/python.sh", "scripts/health_check_summary.py"),
    ),
    Check(
        name="duplicate-route-registrations",
        stage="contracts",
        description="Import the app without lifespan startup and reject duplicate path/method signatures.",
        command=("./scripts/python.sh", "scripts/check_duplicate_routes.py"),
    ),
    Check(
        name="backend-static-analysis",
        stage="backend",
        description="Run Python lint and static correctness rules without modifying files.",
        command=("./scripts/python.sh", "-m", "ruff", "check", "backend"),
    ),
    Check(
        name="backend-stock-contracts",
        stage="contracts",
        description="Verify event sourcing, governed writes, SQL read-only behavior, and route contracts.",
        command=(
            "./scripts/python.sh",
            "-m",
            "pytest",
            "-q",
            "backend/tests/test_governance_contracts.py",
            "backend/tests/test_event_sourcing_contract.py",
            "backend/tests/governance/test_sql_read_only.py",
            "backend/tests/governance/test_count_line_write_service_authority.py",
            "backend/tests/test_route_snapshot.py",
        ),
    ),
    Check(
        name="frontend-typecheck",
        stage="frontend",
        description="Detect TypeScript contract, import, and API-shape mismatches.",
        command=("corepack", "pnpm", "run", "typecheck"),
        cwd="frontend",
    ),
    Check(
        name="frontend-runtime-governance-tests",
        stage="contracts",
        description="Test the frontend runtime-convergence rules.",
        command=("corepack", "pnpm", "run", "governance:runtime:test"),
        cwd="frontend",
    ),
    Check(
        name="backend-test-suite",
        stage="tests",
        description="Run the complete backend test suite.",
        command=("make", "--no-print-directory", "python-test"),
        minimum_profile="standard",
    ),
    Check(
        name="frontend-lint",
        stage="frontend",
        description="Run Expo lint plus changed-file UI governance.",
        command=("corepack", "pnpm", "run", "lint"),
        cwd="frontend",
        minimum_profile="standard",
    ),
    Check(
        name="frontend-test-suite",
        stage="tests",
        description="Run the complete frontend unit and integration test suite.",
        command=("corepack", "pnpm", "run", "test"),
        cwd="frontend",
        minimum_profile="standard",
    ),
    Check(
        name="frontend-ui-governance-tests",
        stage="contracts",
        description="Test UI governance and accessibility-policy scanners.",
        command=("corepack", "pnpm", "run", "governance:ui:test"),
        cwd="frontend",
        minimum_profile="standard",
    ),
    Check(
        name="frontend-runtime-health",
        stage="runtime-static",
        description="Scan for legacy/runtime paths that have not converged.",
        command=(
            "corepack",
            "pnpm",
            "run",
            "governance:runtime:health:strict-advisory",
        ),
        cwd="frontend",
        minimum_profile="standard",
    ),
    Check(
        name="frontend-dependency-regression",
        stage="quality",
        description="Reject dependency growth or undeclared baseline drift.",
        command=("corepack", "pnpm", "run", "deps:guard"),
        cwd="frontend",
        minimum_profile="standard",
    ),
    Check(
        name="backend-strict-typecheck",
        stage="backend",
        description="Run strict Python type checking and surface the full existing debt.",
        command=("make", "--no-print-directory", "python-typecheck-strict"),
        minimum_profile="deep",
    ),
    Check(
        name="frontend-unused-code",
        stage="quality",
        description="Find unused files, exports, and dependencies with the repository Knip config.",
        command=("corepack", "pnpm", "run", "knip:check"),
        cwd="frontend",
        minimum_profile="deep",
    ),
    Check(
        name="backend-security-static",
        stage="security",
        description="Scan production Python paths for security-sensitive coding patterns.",
        command=(
            "./scripts/python.sh",
            "-m",
            "bandit",
            "-r",
            "backend",
            "-x",
            "backend/tests",
        ),
        minimum_profile="deep",
    ),
    Check(
        name="backend-security-evaluation",
        stage="security",
        description="Run the repository's deeper authentication and security evaluation tests.",
        command=("make", "--no-print-directory", "eval-security"),
        minimum_profile="deep",
    ),
    Check(
        name="dependency-vulnerabilities",
        stage="security",
        description="Audit production Python and frontend dependencies; exit 2 means external registry unavailable.",
        command=("bash", "scripts/check_vulnerabilities.sh"),
        minimum_profile="deep",
        blocked_exit_codes=(2,),
        uses_network=True,
    ),
    Check(
        name="tracked-secret-scan",
        stage="security",
        description="Run the configured secret detector across tracked files.",
        command=("pre-commit", "run", "detect-secrets", "--all-files"),
        minimum_profile="deep",
    ),
    Check(
        name="frontend-web-build",
        stage="build",
        description="Compile the web bundle to catch bundler and platform-only runtime errors.",
        command=("corepack", "pnpm", "run", "build:web"),
        cwd="frontend",
        minimum_profile="deep",
    ),
)


@dataclass
class CheckResult:
    name: str
    stage: str
    description: str
    command: list[str]
    cwd: str
    status: str
    exit_code: int | None
    duration_seconds: float
    log: str
    required: bool
    uses_network: bool


def _auditable_files(repo_root: Path) -> list[str]:
    completed = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=repo_root,
        check=True,
        capture_output=True,
    )
    return [
        item.decode("utf-8", errors="replace")
        for item in completed.stdout.split(b"\0")
        if item
    ]


def build_inventory(repo_root: Path) -> dict[str, object]:
    """Create lightweight source-size and exact-duplicate evidence."""
    auditable_files = _auditable_files(repo_root)
    existing_auditable_files = [
        path for path in auditable_files if (repo_root / path).is_file()
    ]
    missing_or_deleted_paths = [
        path for path in auditable_files if not (repo_root / path).is_file()
    ]
    source_files = [
        path
        for path in existing_auditable_files
        if Path(path).suffix.lower() in SOURCE_SUFFIXES
        and any(path == root or path.startswith(f"{root}/") for root in INVENTORY_ROOTS)
    ]
    suffix_counts: Counter[str] = Counter()
    digest_paths: defaultdict[str, list[str]] = defaultdict(list)
    largest: list[dict[str, object]] = []
    unreadable: list[str] = []

    for relative_path in source_files:
        path = repo_root / relative_path
        try:
            content = path.read_bytes()
        except OSError:
            unreadable.append(relative_path)
            continue
        suffix_counts[path.suffix.lower()] += 1
        digest_paths[hashlib.sha256(content).hexdigest()].append(relative_path)
        largest.append(
            {
                "file": relative_path,
                "lines": content.count(b"\n") + 1,
                "bytes": len(content),
            }
        )

    duplicate_groups = [paths for paths in digest_paths.values() if len(paths) > 1]
    duplicate_groups.sort(key=lambda paths: (-len(paths), paths))
    largest.sort(key=lambda item: (-int(item["lines"]), str(item["file"])))
    return {
        "tracked_and_untracked_file_count": len(existing_auditable_files),
        "missing_or_deleted_index_paths": missing_or_deleted_paths,
        "source_file_count": len(source_files),
        "source_counts_by_suffix": dict(sorted(suffix_counts.items())),
        "largest_source_files": largest[:50],
        "exact_duplicate_source_groups": duplicate_groups,
        "unreadable_source_files": unreadable,
        "note": "Exact hashes do not detect near-duplicate logic; the AI graph review covers semantic duplication.",
    }


def select_checks(profile: str, only: set[str] | None = None) -> list[Check]:
    selected = [
        check
        for check in CHECKS
        if PROFILE_RANK[check.minimum_profile] <= PROFILE_RANK[profile]
        and (only is None or check.name in only)
    ]
    if only is not None:
        unknown = only - {check.name for check in CHECKS}
        if unknown:
            raise ValueError(f"Unknown checks: {', '.join(sorted(unknown))}")
    return selected


def run_check(
    check: Check, repo_root: Path, output_dir: Path, timeout_seconds: int
) -> CheckResult:
    log_path = output_dir / "logs" / f"{check.name}.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    exit_code: int | None = None
    status = "failed"
    env = os.environ.copy()
    env.update(
        {"CI": "1", "NO_COLOR": "1", "FORCE_COLOR": "0", "PYTHONDONTWRITEBYTECODE": "1"}
    )
    cwd = repo_root / check.cwd
    command = list(check.command)
    if command[:2] == ["corepack", "pnpm"] and shutil.which(
        "pnpm", path=env.get("PATH")
    ):
        command = ["pnpm", *command[2:]]

    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout_seconds,
            check=False,
        )
        exit_code = completed.returncode
        log_path.write_bytes(completed.stdout)
        if exit_code == 0:
            status = "passed"
        elif exit_code in check.blocked_exit_codes or _is_dependency_failure(
            completed.stdout
        ):
            status = "blocked-dependency"
        elif exit_code in check.warning_exit_codes:
            status = "warning"
        else:
            status = "failed"
    except FileNotFoundError as exc:
        status = "blocked-dependency"
        log_path.write_text(f"{exc}\n", encoding="utf-8")
    except subprocess.TimeoutExpired as exc:
        status = "timeout"
        output = exc.stdout or b""
        if isinstance(output, str):
            output = output.encode()
        log_path.write_bytes(
            output + f"\nTimed out after {timeout_seconds} seconds.\n".encode()
        )

    duration = round(time.monotonic() - started, 3)
    return CheckResult(
        name=check.name,
        stage=check.stage,
        description=check.description,
        command=command,
        cwd=check.cwd,
        status=status,
        exit_code=exit_code,
        duration_seconds=duration,
        log=str(log_path.relative_to(output_dir)),
        required=check.required,
        uses_network=check.uses_network,
    )


def _status_counts(results: Iterable[CheckResult]) -> dict[str, int]:
    return dict(sorted(Counter(result.status for result in results).items()))


def _is_dependency_failure(output: bytes) -> bool:
    normalized = output.decode("utf-8", errors="replace").lower()
    markers = (
        "err_vm_dynamic_import_callback_missing",
        "command not found",
        "could not determine executable to run",
        "no module named ruff",
        "no module named pytest",
        "no module named mypy",
        "no module named bandit",
        "no module named pip_audit",
    )
    return any(marker in normalized for marker in markers)


def determine_terminal_state(results: Sequence[CheckResult]) -> str:
    if any(
        result.required and result.status in {"failed", "timeout"} for result in results
    ):
        return "FAILED_TESTS"
    if any(
        result.required and result.status == "blocked-dependency" for result in results
    ):
        return "BLOCKED_DEPENDENCY"
    return "READY_FOR_REVIEW"


def write_reports(
    output_dir: Path,
    profile: str,
    inventory: dict[str, object],
    results: Sequence[CheckResult],
) -> None:
    generated_at = datetime.now(UTC).isoformat()
    failures = [
        result.name
        for result in results
        if result.required and result.status in {"failed", "timeout"}
    ]
    blocked_dependencies = [
        result.name
        for result in results
        if result.required and result.status == "blocked-dependency"
    ]
    summary = {
        "schema_version": 1,
        "generated_at": generated_at,
        "profile": profile,
        "terminal_state": determine_terminal_state(results),
        "status_counts": _status_counts(results),
        "required_failures": failures,
        "blocked_dependencies": blocked_dependencies,
        "inventory_file": "inventory.json",
        "results": [asdict(result) for result in results],
        "safety": {
            "database_connections": False,
            "application_startup": False,
            "repair_or_migration_commands": False,
            "network_checks_included": any(result.uses_network for result in results),
        },
    }
    (output_dir / "inventory.json").write_text(
        json.dumps(inventory, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (output_dir / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    rows = []
    for result in results:
        command = shlex.join(result.command)
        rows.append(
            f"| `{result.name}` | {result.stage} | **{result.status}** | "
            f"{result.duration_seconds:.3f}s | [{result.log}]({result.log}) | `{command}` |"
        )
    markdown = f"""# Codebase Audit Evidence

- Generated: {generated_at}
- Profile: `{profile}`
- Terminal state: **{summary["terminal_state"]}**
- Required failures: {", ".join(failures) if failures else "none"}
- Blocked dependencies: {", ".join(blocked_dependencies) if blocked_dependencies else "none"}
- Source files inventoried: {inventory["source_file_count"]}
- Exact duplicate source groups: {len(inventory["exact_duplicate_source_groups"])}

| Check | Stage | Status | Duration | Evidence | Command |
|---|---|---:|---:|---|---|
{chr(10).join(rows)}

## AI follow-up

This bundle is the automated evidence phase, not the final defect report. The agent must now:

1. Read every failed or warning log and deduplicate root causes.
2. Use the codebase graph to inspect complexity hotspots, semantic duplicates, untested high-risk paths, and frontend-to-backend route mismatches.
3. Check all Stock Contract V3.1 invariants and SQL read-only boundaries.
4. Create one issue per independently fixable root cause, with evidence and a verification command.
5. Fix one approved issue per loop, add a failing acceptance test first, and stop after three failed implementation cycles.

Do not run database repair, migration, backfill, deployment, or live runtime checks without the repository's human checkpoint.
"""
    (output_dir / "REPORT.md").write_text(markdown, encoding="utf-8")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", choices=tuple(PROFILE_RANK), default="standard")
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Evidence directory (default: .agent/reports/codebase-audit/<UTC timestamp>)",
    )
    parser.add_argument(
        "--timeout", type=int, default=1800, help="Per-check timeout in seconds"
    )
    parser.add_argument("--only", help="Comma-separated check names")
    parser.add_argument(
        "--list",
        action="store_true",
        help="List checks for the selected profile and exit",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    only = (
        {item.strip() for item in args.only.split(",") if item.strip()}
        if args.only
        else None
    )
    try:
        checks = select_checks(args.profile, only)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    if args.list:
        for check in checks:
            network = " [network]" if check.uses_network else ""
            print(f"{check.name}: {check.stage}{network} - {check.description}")
        return 0

    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    output_dir = (
        args.output_dir
        or REPO_ROOT / ".agent" / "reports" / "codebase-audit" / timestamp
    )
    if not output_dir.is_absolute():
        output_dir = REPO_ROOT / output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Audit profile: {args.profile}")
    print(f"Evidence: {output_dir}")
    inventory = build_inventory(REPO_ROOT)
    results: list[CheckResult] = []
    for index, check in enumerate(checks, start=1):
        print(f"[{index}/{len(checks)}] {check.name} ...", flush=True)
        result = run_check(check, REPO_ROOT, output_dir, args.timeout)
        results.append(result)
        print(f"  {result.status} ({result.duration_seconds:.3f}s)", flush=True)

    write_reports(output_dir, args.profile, inventory, results)
    terminal_state = determine_terminal_state(results)
    print(f"Report: {output_dir / 'REPORT.md'}")
    if terminal_state == "FAILED_TESTS":
        return 1
    if terminal_state == "BLOCKED_DEPENDENCY":
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
