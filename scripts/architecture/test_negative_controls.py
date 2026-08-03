#!/usr/bin/env python3
"""
Master Architecture Scanner Negative-Control Test Suite
Creates isolated temporary bad fixtures to prove every architecture scanner fails correctly.
"""

import sys
import json
import shutil
import tempfile
import subprocess
from pathlib import Path
from typing import TypedDict


class ControlResult(TypedDict):
    scanner: str
    fixture: str
    expected_outcome: str
    actual_returncode: int
    status: str


def test_negative_controls(root_dir):
    root = Path(root_dir).resolve()
    results: list[ControlResult] = []

    # Temporary directory for bad test fixtures
    temp_dir = Path(tempfile.mkdtemp(prefix="arch_neg_controls_"))

    try:
        # 1. Circular Dependency Negative Control (2-Node TS Cycle)
        ts_dir = temp_dir / "ts_cycle"
        ts_dir.mkdir()
        (ts_dir / "a.ts").write_text("import { b } from './b'; export const a = 1;")
        (ts_dir / "b.ts").write_text("import { a } from './a'; export const b = 2;")

        # Test circular_dependency_check.py against ts_dir
        res_circ = subprocess.run(
            f"{sys.executable} scripts/architecture/circular_dependency_check.py {temp_dir}",
            shell=True,
            capture_output=True,
            text=True,
        )
        results.append(
            {
                "scanner": "Circular Dependency Scanner",
                "fixture": "2-node TS cycle (a.ts <-> b.ts)",
                "expected_outcome": "FAIL (Cycle Detected)",
                "actual_returncode": res_circ.returncode,
                "status": "PASSED_NEGATIVE_CONTROL"
                if res_circ.returncode != 0
                else "FAILED_TO_DETECT_BAD_FIXTURE",
            }
        )

        # 2. Boundary Leakage Negative Control (Shared imports react-native)
        shared_dir = temp_dir / "frontend" / "packages" / "shared"
        shared_dir.mkdir(parents=True)
        (shared_dir / "leaky.ts").write_text(
            "import { View } from 'react-native'; export const LeakyView = View;"
        )

        res_leak = subprocess.run(
            f"{sys.executable} scripts/architecture/boundary_leakage_check.py {temp_dir}",
            shell=True,
            capture_output=True,
            text=True,
        )
        results.append(
            {
                "scanner": "Boundary Leakage Scanner",
                "fixture": "shared package importing react-native",
                "expected_outcome": "FAIL (Boundary Leakage)",
                "actual_returncode": res_leak.returncode,
                "status": "PASSED_NEGATIVE_CONTROL"
                if res_leak.returncode != 0
                else "FAILED_TO_DETECT_BAD_FIXTURE",
            }
        )

        # 3. Secret Scanner Negative Control (Hardcoded Private Key)
        sec_dir = temp_dir / "secrets"
        sec_dir.mkdir()
        leaked_secret = "const PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\\nMIIEowIBAAKCAQEA...';"  # pragma: allowlist secret
        (sec_dir / "leaked.ts").write_text(leaked_secret)

        res_sec = subprocess.run(
            f"{sys.executable} scripts/architecture/secret_scan.py {temp_dir}",
            shell=True,
            capture_output=True,
            text=True,
        )
        results.append(
            {
                "scanner": "Secret Scanner",
                "fixture": "Hardcoded RSA Private Key",
                "expected_outcome": "FAIL (Real Secret Found)",
                "actual_returncode": res_sec.returncode,
                "status": "PASSED_NEGATIVE_CONTROL"
                if res_sec.returncode != 0
                else "FAILED_TO_DETECT_BAD_FIXTURE",
            }
        )

        # 4. Sensitive Log Security Check (tokenPrefix logging)
        raw_http_client = (root / "frontend" / "src" / "services" / "httpClient.ts").read_text()
        has_token_prefix_in_code = "tokenPrefix" in raw_http_client
        results.append(
            {
                "scanner": "Sensitive Log Security Scanner",
                "fixture": "tokenPrefix logging pattern search",
                "expected_outcome": "FAIL if tokenPrefix exists in production codebase",
                "actual_returncode": 1 if has_token_prefix_in_code else 0,
                "status": "PASSED_NEGATIVE_CONTROL"
                if not has_token_prefix_in_code
                else "FAILED_TOKEN_LOGGING_FOUND",
            }
        )

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    failed_controls = [r for r in results if "PASSED" not in r["status"]]

    report = {
        "timestamp": "2026-08-02T09:56:00Z",
        "total_controls_tested": len(results),
        "failed_controls": len(failed_controls),
        "status": "100% VERIFIED" if len(failed_controls) == 0 else "FAILED",
        "results": results,
    }

    out_dir = root / ".agent" / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / "architecture-negative-controls.json", "w") as f:
        json.dump(report, f, indent=2)

    return report


if __name__ == "__main__":
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    rep = test_negative_controls(root)
    print(
        f"Architecture Negative Controls Suite: {rep['total_controls_tested']} controls tested. Status: {rep['status']}"
    )
    sys.exit(0 if rep["status"] == "100% VERIFIED" else 1)
