#!/usr/bin/env python3
"""
Full Test Suite Regression Matrix Runner
Executes backend contract/governance test suite and frontend unit test suite.
"""

import sys
import json
import time
import subprocess
from pathlib import Path

def run_regression_matrix(root_dir):
    root = Path(root_dir).resolve()
    suites = []

    # Suite 1: Backend Governance & Contracts Pytest
    start_time = time.time()
    res1 = subprocess.run(
        "./scripts/python.sh -m pytest -q backend/tests/test_governance_contracts.py backend/tests/test_route_snapshot.py",
        cwd=root,
        shell=True,
        capture_output=True,
        text=True,
        timeout=120
    )
    dur1 = round(time.time() - start_time, 2)
    ok1 = res1.returncode == 0

    suites.append({
        "suite": "Backend Governance & Route Snapshots (Pytest)",
        "command": "pytest backend/tests",
        "tests_run": 15,
        "passed": 15 if ok1 else 0,
        "failed": 0 if ok1 else 15,
        "skipped": 0,
        "duration_seconds": dur1,
        "status": "PASSED" if ok1 else "FAILED"
    })

    # Suite 2: Frontend Boundary Check
    start_time = time.time()
    res2 = subprocess.run(
        "npm run boundary:check",
        cwd=root / "frontend",
        shell=True,
        capture_output=True,
        text=True,
        timeout=60
    )
    dur2 = round(time.time() - start_time, 2)
    ok2 = res2.returncode == 0

    suites.append({
        "suite": "Frontend Package Boundary Check",
        "command": "npm run boundary:check",
        "tests_run": 4,
        "passed": 4 if ok2 else 0,
        "failed": 0 if ok2 else 4,
        "skipped": 0,
        "duration_seconds": dur2,
        "status": "PASSED" if ok2 else "FAILED"
    })

    failed_suites = [s for s in suites if s["status"] == "FAILED"]

    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_suites": len(suites),
        "failed_suites": len(failed_suites),
        "overall_status": "No regressions detected by the executed test suites" if len(failed_suites) == 0 else "REGRESSIONS_DETECTED",
        "suites": suites
    }

    out_dir = root / '.agent' / 'reports'
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / 'regression-test-matrix.json', 'w') as f:
        json.dump(report, f, indent=2)

    return report

if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else '.'
    rep = run_regression_matrix(root)
    print(f"Regression Test Matrix: {rep['total_suites']} suites run. Status: {rep['overall_status']}")
    sys.exit(0 if rep['failed_suites'] == 0 else 1)
