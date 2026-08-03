from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from scripts.codebase_audit_loop import (
    Check,
    CheckResult,
    build_inventory,
    determine_terminal_state,
    run_check,
    select_checks,
)


def test_standard_profile_excludes_deep_network_checks() -> None:
    names = {check.name for check in select_checks("standard")}

    assert "backend-test-suite" in names
    assert "frontend-test-suite" in names
    assert "dependency-vulnerabilities" not in names
    assert "frontend-web-build" not in names


def test_deep_profile_includes_every_defined_layer() -> None:
    names = {check.name for check in select_checks("deep")}

    assert "repository-hygiene" in names
    assert "backend-strict-typecheck" in names
    assert "frontend-unused-code" in names
    assert "dependency-vulnerabilities" in names


def test_inventory_reports_exact_duplicate_source_files(tmp_path: Path) -> None:
    (tmp_path / "backend").mkdir()
    (tmp_path / "frontend" / "src").mkdir(parents=True)
    (tmp_path / "backend" / "first.py").write_text("VALUE = 1\n", encoding="utf-8")
    deleted_path = tmp_path / "backend" / "deleted.py"
    deleted_path.write_text("DELETED = True\n", encoding="utf-8")
    (tmp_path / "frontend" / "src" / "second.ts").write_text("VALUE = 1\n", encoding="utf-8")
    (tmp_path / "ignored.txt").write_text("VALUE = 1\n", encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(["git", "add", "backend/deleted.py"], cwd=tmp_path, check=True)
    deleted_path.unlink()
    inventory = build_inventory(tmp_path)

    assert inventory["source_file_count"] == 2
    assert inventory["exact_duplicate_source_groups"] == [
        ["backend/first.py", "frontend/src/second.ts"]
    ]
    assert inventory["missing_or_deleted_index_paths"] == ["backend/deleted.py"]


def test_run_check_records_failure_and_keeps_log(tmp_path: Path) -> None:
    check = Check(
        name="intentional-failure",
        stage="test",
        description="exercise failure collection",
        command=(sys.executable, "-c", "print('evidence'); raise SystemExit(7)"),
    )
    output_dir = tmp_path / "evidence"

    result = run_check(check, tmp_path, output_dir, timeout_seconds=30)

    assert result.status == "failed"
    assert result.exit_code == 7
    assert "evidence" in (output_dir / result.log).read_text(encoding="utf-8")


def test_run_check_prefers_installed_pnpm_over_corepack(tmp_path: Path, monkeypatch) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    pnpm = fake_bin / "pnpm"
    pnpm.write_text("#!/usr/bin/env sh\necho direct-pnpm\n", encoding="utf-8")
    pnpm.chmod(0o755)
    monkeypatch.setenv("PATH", f"{fake_bin}:{os.environ['PATH']}")
    check = Check(
        name="pnpm-resolution",
        stage="test",
        description="exercise package manager resolution",
        command=("corepack", "pnpm", "--version"),
    )
    output_dir = tmp_path / "evidence"

    result = run_check(check, tmp_path, output_dir, timeout_seconds=30)

    assert result.status == "passed"
    assert result.command == ["pnpm", "--version"]
    assert "direct-pnpm" in (output_dir / result.log).read_text(encoding="utf-8")


def test_run_check_classifies_missing_tool_as_blocked_dependency(tmp_path: Path) -> None:
    check = Check(
        name="missing-tool",
        stage="test",
        description="exercise dependency classification",
        command=("tool-that-does-not-exist-stock-verify",),
    )

    result = run_check(check, tmp_path, tmp_path / "evidence", timeout_seconds=30)

    assert result.status == "blocked-dependency"
    assert determine_terminal_state([result]) == "BLOCKED_DEPENDENCY"


def test_evidence_only_success_is_ready_for_review_not_pass() -> None:
    result = CheckResult(
        name="successful-check",
        stage="test",
        description="successful automated evidence",
        command=["true"],
        cwd=".",
        status="passed",
        exit_code=0,
        duration_seconds=0.01,
        log="logs/successful-check.log",
        required=True,
        uses_network=False,
    )

    assert determine_terminal_state([result]) == "READY_FOR_REVIEW"
