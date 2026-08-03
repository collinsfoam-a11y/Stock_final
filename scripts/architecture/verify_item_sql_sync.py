"""Generate evidence-backed verification for the item SQL sync subsystem.

The harness is intentionally hermetic: it executes source-backed tests and
policy probes, records their real exit codes, and never connects to SQL Server
or MongoDB. It does not emit a passing claim for behavior it did not execute.
"""

from __future__ import annotations

import ast
import hashlib
import json
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


CHECKS = [
    {
        "name": "sql_connector_security",
        "command": [
            "./scripts/python.sh",
            "-m",
            "pytest",
            "-q",
            "backend/tests/test_sql_connector.py",
            "backend/tests/test_sql_readonly.py",
            "backend/tests/test_db_connection.py",
        ],
    },
    {
        "name": "item_sync_behavior",
        "command": [
            "./scripts/python.sh",
            "-m",
            "pytest",
            "-q",
            "backend/tests/test_erp_sync_service.py",
            "backend/tests/test_erp_mapping.py",
            "backend/tests/services/test_sql_sync_service.py",
            "backend/tests/test_sync_service.py",
            "backend/tests/test_sync_management_api.py",
            "backend/tests/test_sync_conflicts_service.py",
            "backend/tests/test_offline_sync.py",
            "backend/tests/test_search_service.py",
            "backend/tests/test_search_api.py",
            "backend/tests/test_enhanced_item_search.py",
        ],
    },
    {
        "name": "governance_contracts",
        "command": [
            "./scripts/python.sh",
            "-m",
            "pytest",
            "-q",
            "backend/tests/test_governance_contracts.py",
        ],
    },
    {
        "name": "legacy_batch_sync_compatibility",
        "required": False,
        "command": [
            "./scripts/python.sh",
            "-m",
            "pytest",
            "-q",
            "backend/tests/test_sync.py",
        ],
    },
    {
        "name": "changed_file_lint",
        "command": [
            "./scripts/python.sh",
            "-m",
            "ruff",
            "check",
            "backend/sql_server_connector.py",
            "backend/utils/db_connection.py",
            "backend/services/sync/core_sync.py",
            "backend/services/sync/nightly.py",
            "backend/db/indexes.py",
            "backend/tests/test_sql_connector.py",
            "backend/tests/test_db_connection.py",
            "backend/tests/services/test_sql_sync_service.py",
            "scripts/architecture/verify_item_sql_sync.py",
        ],
    },
]


FLOW_SYMBOLS = [
    {
        "file": "backend/sql_server_connector.py",
        "class": "SQLServerConnector",
        "symbol": "get_item_quantities_only",
        "responsibility": "Read aggregate ERP quantity by item code through guarded SELECTs.",
        "inputs": ["item_codes"],
        "outputs": ["item_code_to_quantity"],
        "upstream_dependency": "SQL Server ERP",
        "downstream_dependency": "SQLSyncCoreSyncMixin.sync_variance_only",
        "ownership": "ERP read-only connector",
    },
    {
        "file": "backend/services/sync/core_sync.py",
        "class": "SQLSyncCoreSyncMixin",
        "symbol": "sync_variance_only",
        "responsibility": "Compare ERP aggregate quantities with the Mongo item mirror.",
        "inputs": ["erp_items.item_code", "ERP aggregate quantities"],
        "outputs": ["variance stats", "changed Mongo item quantities", "sync audit events"],
        "upstream_dependency": "SQLServerConnector.get_item_quantities_only",
        "downstream_dependency": "Mongo erp_items and sync_audit",
        "ownership": "Primary scheduled item quantity sync",
    },
    {
        "file": "backend/services/sync/core_sync.py",
        "class": "SQLSyncCoreSyncMixin",
        "symbol": "_consolidate_sql_items",
        "responsibility": "Collapse batch-level source rows to deterministic item-level totals.",
        "inputs": ["batch-level ERP rows"],
        "outputs": ["one row per item_code", "duplicate row count"],
        "upstream_dependency": "SQLServerConnector.get_all_items",
        "downstream_dependency": "full and nightly item sync",
        "ownership": "Item mirror normalization",
    },
    {
        "file": "backend/services/sync/nightly.py",
        "class": "SQLSyncNightlyMixin",
        "symbol": "nightly_full_sync",
        "responsibility": "Run the scheduled full mirror verification without deleting ERP-missing items.",
        "inputs": ["all active barcode-bearing ERP rows"],
        "outputs": ["item mutations", "run and batch audit events"],
        "upstream_dependency": "SQLServerConnector.get_all_items",
        "downstream_dependency": "Mongo erp_items, sync_metadata, and sync_audit",
        "ownership": "Nightly item mirror verification",
    },
    {
        "file": "backend/services/change_detection_sync.py",
        "class": "ChangeDetectionSyncService",
        "symbol": "_sync_changes",
        "responsibility": "Legacy product metadata updater targeting the products collection.",
        "inputs": ["mapped Products rows"],
        "outputs": ["products bulk updates"],
        "upstream_dependency": "manual change-sync endpoint or its own scheduler",
        "downstream_dependency": "Mongo products collection",
        "ownership": "Parallel legacy metadata path; not the erp_items quantity mirror",
    },
]


def _run_check(spec: dict[str, Any], log_parts: list[str]) -> dict[str, Any]:
    started = time.monotonic()
    completed = subprocess.run(
        spec["command"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    duration = round(time.monotonic() - started, 3)
    output = completed.stdout or ""
    log_parts.extend(
        [
            f"$ {' '.join(spec['command'])}",
            output.rstrip(),
            f"[exit={completed.returncode} duration_seconds={duration}]",
            "",
        ]
    )
    return {
        "name": spec["name"],
        "required": spec.get("required", True),
        "command": spec["command"],
        "exit_code": completed.returncode,
        "duration_seconds": duration,
        "output_sha256": hashlib.sha256(output.encode("utf-8")).hexdigest(),
        "passed": completed.returncode == 0,
    }


def _symbol_line(file_path: Path, class_name: str, symbol: str) -> int | None:
    tree = ast.parse(file_path.read_text(encoding="utf-8"), filename=str(file_path))
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            for child in node.body:
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)) and child.name == symbol:
                    return child.lineno
    return None


def _flow_evidence() -> list[dict[str, Any]]:
    evidence: list[dict[str, Any]] = []
    for item in FLOW_SYMBOLS:
        entry = dict(item)
        line = _symbol_line(ROOT / item["file"], item["class"], item["symbol"])
        entry["line"] = line
        entry["symbol_verified"] = line is not None
        evidence.append(entry)
    return evidence


def _policy_probes() -> dict[str, Any]:
    from backend.sql_server_connector import SQLServerConnector
    from backend.utils.db_connection import SQLServerConnectionBuilder

    connector = SQLServerConnector()
    blocked_queries = {
        "OPENQUERY": "SELECT * FROM OPENQUERY(ERP, 'SELECT 1')",
        "OPENROWSET": "SELECT * FROM OPENROWSET('MSOLEDBSQL', 'Server=erp', 'SELECT 1')",
        "OPENDATASOURCE": "SELECT * FROM OPENDATASOURCE('MSOLEDBSQL', 'Data Source=erp').db.dbo.Products",
        "WAITFOR": "WITH x AS (SELECT 1 AS value) SELECT * FROM x WHERE WAITFOR = 1",
        "linked_server": "SELECT * FROM [ERP].[Inventory].[dbo].[Products]",
    }
    guard_results = {
        name: {"allowed": connector.is_safe_query(query), "expected_allowed": False}
        for name, query in blocked_queries.items()
    }
    guard_results["parameterized_select"] = {
        "allowed": connector.is_safe_query(
            "SELECT * FROM dbo.Products WHERE ProductCode = ?", ["ITEM-1"]
        ),
        "expected_allowed": True,
    }

    original_driver = SQLServerConnectionBuilder._detected_driver
    try:
        SQLServerConnectionBuilder._detected_driver = "ODBC Driver 18 for SQL Server"
        connection_string = SQLServerConnectionBuilder.build_connection_string(
            host="example.invalid", database="ERP_EVIDENCE_ONLY"
        )
    finally:
        SQLServerConnectionBuilder._detected_driver = original_driver

    return {
        "sql_guard": guard_results,
        "sql_guard_passed": all(
            result["allowed"] == result["expected_allowed"]
            for result in guard_results.values()
        ),
        "connection_intent": {
            "read_only_present": "ApplicationIntent=ReadOnly" in connection_string,
            "read_write_absent": "ApplicationIntent=ReadWrite" not in connection_string,
            "connection_attempted": False,
        },
    }


def _write_report(
    out_dir: Path,
    status: str,
    checks: list[dict[str, Any]],
    probes: dict[str, Any],
    flow: list[dict[str, Any]],
) -> None:
    required_checks = [check for check in checks if check["required"]]
    optional_checks = [check for check in checks if not check["required"]]
    required_passed = sum(1 for check in required_checks if check["passed"])
    optional_passed = sum(1 for check in optional_checks if check["passed"])
    lines = [
        "# Item SQL Sync Production Hardening Verification",
        "",
        f"Status: **{status}**",
        "",
        "This report is generated from executed hermetic tests, runtime policy probes, and AST-verified symbols. It does not claim a live SQL Server or MongoDB production run.",
        "",
        "## Verification results",
        "",
        f"- Required command checks passed: {required_passed}/{len(required_checks)}",
        f"- Optional broader checks passed: {optional_passed}/{len(optional_checks)}",
        f"- SQL policy probes passed: {probes['sql_guard_passed']}",
        f"- Read-only application intent present: {probes['connection_intent']['read_only_present']}",
        f"- Flow symbols verified: {sum(1 for item in flow if item['symbol_verified'])}/{len(flow)}",
        "",
        "## Executed commands",
        "",
    ]
    for check in checks:
        requirement = "required" if check["required"] else "optional broader check"
        lines.append(
            f"- `{check['name']}` ({requirement}): exit {check['exit_code']} in {check['duration_seconds']}s"
        )
    lines.extend(
        [
            "",
            "## Evidence boundary and remaining live gates",
            "",
            "- Live ERP login permissions were not inspected; the integration test remains explicitly skipped until a DBA-controlled connection is available.",
            "- No live ERP query, Mongo mutation, scheduler run, deployment, or production-data write was performed.",
            "- The full ERP query remains capped and barcode-filtered; completeness against the live ERP schema requires an operational read-only acceptance run.",
            "- Audit retention policy is not imposed by this change; the new indexes support run, event, and mode timelines without deleting history.",
            "",
        ]
    )
    (out_dir / "REPORT.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out_dir = ROOT / ".agent" / "reports" / "item-sql-sync" / timestamp
    out_dir.mkdir(parents=True, exist_ok=True)

    log_parts: list[str] = []
    checks = [_run_check(spec, log_parts) for spec in CHECKS]
    probes = _policy_probes()
    flow = _flow_evidence()

    all_passed = (
        all(check["passed"] for check in checks if check["required"])
        and probes["sql_guard_passed"]
        and probes["connection_intent"]["read_only_present"]
        and probes["connection_intent"]["read_write_absent"]
        and all(item["symbol_verified"] for item in flow)
    )
    status = "READY_FOR_REVIEW" if all_passed else "FAILED_TESTS"
    summary = {
        "schema_version": 1,
        "generated_at": datetime.now(UTC).isoformat(),
        "status": status,
        "scope": "hermetic item SQL sync production hardening verification",
        "checks": checks,
        "policy_probes": probes,
        "flow_symbols_verified": all(item["symbol_verified"] for item in flow),
        "live_systems_touched": [],
        "evidence_boundary": "No live SQL Server or MongoDB connection was attempted.",
    }

    (out_dir / "verification-summary.json").write_text(
        json.dumps(summary, indent=2, default=str) + "\n", encoding="utf-8"
    )
    (out_dir / "item-sync-flow.json").write_text(
        json.dumps(flow, indent=2) + "\n", encoding="utf-8"
    )
    (out_dir / "verification-commands.log").write_text(
        "\n".join(log_parts), encoding="utf-8"
    )
    _write_report(out_dir, status, checks, probes, flow)

    print(f"{status}: {out_dir}")
    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
