from __future__ import annotations

import json
from pathlib import Path

import pytest
from scripts.approval_pipeline import (
    ApprovalError,
    append_entry,
    approve_run,
    create_request_entry,
    finalize_execution,
    log_execution_state,
    read_entries,
    validate_execution,
    verify_chain,
)

HIGH_RISK_COMMAND = (
    "./scripts/python.sh backend/scripts/backfill_session_snapshots.py --execute --limit 1"
)
GIT_RM_COMMAND = (
    "git rm 'backend/tests/evaluation/reports/evaluation_report_*.json' "
    "'frontend/testsprite_tests/tmp/*.json'"
)


def _write_request(log_path: Path, *, expected_records: int = 0) -> dict[str, object]:
    request = create_request_entry(
        action="backfill-session-snapshots",
        command=HIGH_RISK_COMMAND,
        requested_risk_level=None,
        run_id=None,
        call_id=None,
        notes="dry-run reviewed",
        impact="Repairs snapshot documents.",
        scope="session_snapshots,sessions",
        expected_records=expected_records,
        query_filter={"item_count": 0},
    )
    return append_entry(log_path, request)


def test_hash_chain_and_verification_lifecycle(tmp_path: Path) -> None:
    log_path = tmp_path / "approval-log.jsonl"
    request = _write_request(log_path, expected_records=1)

    approved = approve_run(log_path, request["run_id"], "ops.user")
    assert approved["status"] == "approved"

    with pytest.raises(ApprovalError, match="requires the explicit --confirm"):
        validate_execution(
            log_path,
            command=HIGH_RISK_COMMAND,
            run_id=request["run_id"],
            execution_hash=request["execution_hash"],
            confirm=False,
        )

    validation = validate_execution(
        log_path,
        command=HIGH_RISK_COMMAND,
        run_id=request["run_id"],
        execution_hash=request["execution_hash"],
        confirm=True,
    )
    assert validation["risk_level"] == "L3"
    assert validation["approved_by"] == "ops.user"

    executed = log_execution_state(log_path, run_id=request["run_id"], status="executed")
    assert executed["status"] == "executed"

    result = finalize_execution(
        log_path,
        run_id=request["run_id"],
        command=HIGH_RISK_COMMAND,
        execution_hash=request["execution_hash"],
        confirm=True,
        exit_code=0,
        output_text="\n".join(
            [
                "=== Session Snapshot Backfill Results ===",
                "Scanned: 1",
                "Repairable: 1",
                "Repaired: 1",
                "Errors: 0",
            ]
        ),
    )

    assert result["status"] == "completed"
    assert result["verification"]["passed"] is True

    chain = verify_chain(log_path)
    assert chain["valid"] is True
    assert chain["entries"] == 4


def test_finalize_marks_failed_when_verification_mismatches(tmp_path: Path) -> None:
    log_path = tmp_path / "approval-log.jsonl"
    request = _write_request(log_path, expected_records=2)
    approve_run(log_path, request["run_id"], "ops.user")
    log_execution_state(log_path, run_id=request["run_id"], status="executed")

    result = finalize_execution(
        log_path,
        run_id=request["run_id"],
        command=HIGH_RISK_COMMAND,
        execution_hash=request["execution_hash"],
        confirm=True,
        exit_code=0,
        output_text="Repaired: 1\nErrors: 0\n",
    )

    assert result["status"] == "failed"
    assert result["verification"]["passed"] is False
    assert result["verification"]["actual"] == 1


def test_tamper_detection_rejects_mutated_log_entries(tmp_path: Path) -> None:
    log_path = tmp_path / "approval-log.jsonl"
    _write_request(log_path)

    raw_lines = log_path.read_text(encoding="utf-8").splitlines()
    entry = json.loads(raw_lines[0])
    entry["command"] = "echo tampered"
    raw_lines[0] = json.dumps(entry, sort_keys=True)
    log_path.write_text("\n".join(raw_lines) + "\n", encoding="utf-8")

    with pytest.raises(ApprovalError, match="execution_hash|tampered"):
        read_entries(log_path)


def test_low_risk_command_does_not_require_approval(tmp_path: Path) -> None:
    result = validate_execution(
        tmp_path / "unused.jsonl",
        command="echo hello",
        run_id=None,
        execution_hash=None,
        confirm=False,
    )

    assert result["approval_required"] is False
    assert result["risk_level"] == "L0"


def test_git_rm_command_preserves_explicit_approval_run(tmp_path: Path) -> None:
    log_path = tmp_path / "approval-log.jsonl"
    request = append_entry(
        log_path,
        create_request_entry(
            action="tracked-hygiene-cleanup",
            command=GIT_RM_COMMAND,
            requested_risk_level="L3",
            run_id=None,
            call_id=None,
            notes="remove tracked generated artifacts",
            impact="Removes generated JSON artifacts from git.",
            scope="backend/tests/evaluation/reports,frontend/testsprite_tests/tmp",
            expected_records=4,
            query_filter={},
        ),
    )
    approve_run(log_path, request["run_id"], "ops.user")

    validation = validate_execution(
        log_path,
        command=GIT_RM_COMMAND,
        run_id=request["run_id"],
        execution_hash=request["execution_hash"],
        confirm=True,
    )

    assert validation["approval_required"] is True
    assert validation["risk_level"] == "L3"
    assert validation["approved_by"] == "ops.user"

    executed = log_execution_state(log_path, run_id=request["run_id"], status="executed")
    assert executed["status"] == "executed"

    result = finalize_execution(
        log_path,
        run_id=request["run_id"],
        command=GIT_RM_COMMAND,
        execution_hash=request["execution_hash"],
        confirm=True,
        exit_code=0,
        output_text="",
    )

    assert result["status"] == "completed"
    assert verify_chain(log_path)["entries"] == 4


def test_appending_request_archives_legacy_log(tmp_path: Path) -> None:
    log_path = tmp_path / "approval-log.jsonl"
    log_path.write_text(
        json.dumps(
            {
                "timestamp_utc": "2026-01-01T00:00:00Z",
                "run_id": "legacy_run",
                "call_id": "legacy_call",
                "status": "requested",
                "action": "legacy-action",
                "command": "echo legacy",
            }
        )
        + "\n",
        encoding="utf-8",
    )

    append_entry(
        log_path,
        create_request_entry(
            action="backfill-session-snapshots",
            command=HIGH_RISK_COMMAND,
            requested_risk_level=None,
            run_id=None,
            call_id=None,
            notes=None,
            impact=None,
            scope=None,
            expected_records=0,
            query_filter={},
        ),
    )

    archived_logs = list(tmp_path.glob("approval-log.legacy-*.jsonl"))
    assert len(archived_logs) == 1
    assert read_entries(log_path)[0]["status"] == "requested"
