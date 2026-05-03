#!/usr/bin/env python3
"""Static guardrails for projection/report runtime paths."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

BROAD_EXCEPTION_PATHS = [
    "backend/api/report_generation_api.py",
    "backend/services/advanced_report_service.py",
    "backend/services/projection_read_service.py",
    "backend/services/projection_readiness_gate.py",
]

PROJECTION_RUNTIME_PATHS = [
    *BROAD_EXCEPTION_PATHS,
    "backend/api/realtime_dashboard_api.py",
    "backend/api/admin_dashboard_api.py",
]

BOUNDARY_API_PATHS = [
    "backend/api/report_generation_api.py",
    "backend/api/realtime_dashboard_api.py",
    "backend/api/admin_dashboard_api.py",
    "backend/api/sync_batch_api.py",
    "backend/api/session_management_api.py",
]

DISALLOWED_SOURCE_RE = re.compile(
    r"\b("
    + "fall"
    + r"back|"
    + "legacy"
    + r".*projection|projection.*"
    + "legacy"
    + r")\b",
    re.I,
)
BROAD_EXCEPTION_TOKEN = "except " + "Exception"
FORBIDDEN_API_IMPORT_RE = re.compile(
    r"\b(from|import)\s+(pyodbc|tenacity|backend\.sql_server_connector)\b"
)
UI_SHADOW_PROP_RE = re.compile(r"\bshadow(Color|Offset|Opacity|Radius)\b")
UI_LAYER_GLOBS = [
    "frontend/app/**/*.ts",
    "frontend/app/**/*.tsx",
    "frontend/src/components/**/*.ts",
    "frontend/src/components/**/*.tsx",
    "frontend/src/screens/**/*.ts",
    "frontend/src/screens/**/*.tsx",
    "frontend/src/domains/**/*.ts",
    "frontend/src/domains/**/*.tsx",
]
TEMPORAL_CONSISTENCY_GUARDS: dict[str, re.Pattern[str]] = {
    # Projection freshness and snapshot cutover must not rely on processing-time fields.
    "backend/services/projection_read_service.py": re.compile(
        r"\b(PROJECTION_SESSION_TIMESTAMP_FIELDS|PROJECTION_ITEM_TIMESTAMP_FIELDS)\b"
    ),
    # Projection parity lag checks must not use projection write timestamps.
    "backend/scripts/validate_projection_parity.py": re.compile(
        r"(projection_updated_at|_first_present\(\s*row\s*,\s*\"updated_at\")"
    ),
}


def _scan(path: Path, predicate) -> list[str]:
    findings: list[str] = []
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if predicate(line):
            findings.append(f"{path.relative_to(ROOT)}:{line_no}: {line.strip()}")
    return findings


def fail_if_match(failures: list[str], path_glob: str, pattern: re.Pattern[str]) -> None:
    for path in ROOT.glob(path_glob):
        if not path.is_file():
            continue
        failures.extend(_scan(path, lambda line: bool(pattern.search(line))))


def main() -> int:
    failures: list[str] = []

    for rel_path in BROAD_EXCEPTION_PATHS:
        path = ROOT / rel_path
        failures.extend(_scan(path, lambda line: BROAD_EXCEPTION_TOKEN in line))

    for rel_path in PROJECTION_RUNTIME_PATHS:
        path = ROOT / rel_path
        failures.extend(_scan(path, lambda line: bool(DISALLOWED_SOURCE_RE.search(line))))

    for rel_path in BOUNDARY_API_PATHS:
        path = ROOT / rel_path
        failures.extend(_scan(path, lambda line: bool(FORBIDDEN_API_IMPORT_RE.search(line))))

    for path_glob in UI_LAYER_GLOBS:
        fail_if_match(failures, path_glob, UI_SHADOW_PROP_RE)

    for rel_path, pattern in TEMPORAL_CONSISTENCY_GUARDS.items():
        path = ROOT / rel_path
        failures.extend(_scan(path, lambda line: bool(pattern.search(line))))

    if failures:
        print("Governance static check failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("Governance static check passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
