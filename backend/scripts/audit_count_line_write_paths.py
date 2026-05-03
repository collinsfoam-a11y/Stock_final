"""
Audit count-line write paths for normalization bypasses.

Guarantees:
- API/service/script code does not mutate `count_lines` directly
- canonical write paths continue to use CountLineWriteService.process_write
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_PATH = Path(".agent/reports/count-line-write-path-audit.json")

TARGET_DIRS = (
    PROJECT_ROOT / "backend" / "api",
    PROJECT_ROOT / "backend" / "services",
    PROJECT_ROOT / "backend" / "scripts",
)

DIRECT_WRITE_PATTERN = re.compile(
    r"\bcount_lines\.(?:insert_one|update_one|replace_one|find_one_and_update|bulk_write|delete_one|delete_many)\("
)
PROCESS_WRITE_PATTERN = re.compile(r"\.process_write\(")

REQUIRED_PROCESS_WRITE_FILES = (
    PROJECT_ROOT / "backend" / "api" / "count_lines_routes.py",
    PROJECT_ROOT / "backend" / "api" / "sync_batch_api.py",
    PROJECT_ROOT / "backend" / "services" / "recount_service.py",
    PROJECT_ROOT / "backend" / "services" / "sync_conflicts_service.py",
    PROJECT_ROOT / "backend" / "services" / "unknown_item_service.py",
)


@dataclass
class Match:
    path: str
    line: int
    text: str

    def as_dict(self) -> dict[str, Any]:
        return {"path": self.path, "line": self.line, "text": self.text}


def _resolve_path(path: Path) -> Path:
    return path if path.is_absolute() else PROJECT_ROOT / path


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _iter_python_files() -> list[Path]:
    files: list[Path] = []
    for root in TARGET_DIRS:
        files.extend(sorted(root.rglob("*.py")))
    return files


def _scan_direct_writes(files: list[Path]) -> list[Match]:
    findings: list[Match] = []
    for file_path in files:
        if file_path.name == "count_line_write_service.py":
            continue
        lines = file_path.read_text(encoding="utf-8", errors="ignore").splitlines()
        for idx, line in enumerate(lines, start=1):
            if DIRECT_WRITE_PATTERN.search(line):
                findings.append(
                    Match(
                        path=str(file_path.relative_to(PROJECT_ROOT)),
                        line=idx,
                        text=line.strip(),
                    )
                )
    return findings


def _scan_required_process_write() -> list[dict[str, Any]]:
    status: list[dict[str, Any]] = []
    for file_path in REQUIRED_PROCESS_WRITE_FILES:
        source = file_path.read_text(encoding="utf-8", errors="ignore")
        status.append(
            {
                "path": str(file_path.relative_to(PROJECT_ROOT)),
                "uses_process_write": bool(PROCESS_WRITE_PATTERN.search(source)),
            }
        )
    return status


def build_report() -> dict[str, Any]:
    files = _iter_python_files()
    direct_write_findings = _scan_direct_writes(files)
    process_write_status = _scan_required_process_write()

    checks = {
        "no_direct_count_lines_writes": len(direct_write_findings) == 0,
        "required_paths_use_process_write": all(
            entry["uses_process_write"] for entry in process_write_status
        ),
    }
    passed = all(checks.values())
    failures = [name for name, ok in checks.items() if not ok]

    return {
        "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
        "scanned_files": len(files),
        "checks": checks,
        "passed": passed,
        "failures": failures,
        "direct_write_findings": [finding.as_dict() for finding in direct_write_findings],
        "required_process_write_paths": process_write_status,
    }


def write_report(report: dict[str, Any], output_path: Path) -> Path:
    resolved = _resolve_path(output_path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(json.dumps(report, indent=2, default=_json_default) + "\n")
    return resolved


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Path to store the write-path audit report.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    report = build_report()
    output = write_report(report, args.output)
    print("=== Count-Line Write-Path Audit ===")
    print(f"Passed: {report['passed']}")
    print(f"Failures: {report['failures']}")
    print(f"Report: {output}")
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
