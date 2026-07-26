# Hardening Follow-Up Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the next production-hardening pass without touching governance-restricted verification files.

**Architecture:** Fix the remaining non-governance runtime/type mismatches in place, backed by narrow regression tests. Keep repo tooling cross-platform by tightening cleanup behavior, ignoring transient local artifacts, and adding a Windows entrypoint check to CI.

**Tech Stack:** FastAPI, Motor, pytest, mypy, PowerShell, bash, GitHub Actions

---

### Task 1: Count Line ERP Qty Coercion

**Files:**
- Modify: `backend/api/count_lines_routes.py`
- Test: `backend/tests/api/test_count_lines_persistence.py`

**Step 1: Write the failing test**

Add a regression test that creates a count line when the snapshot returns `erp_qty=None`, and assert the route stores `erp_qty=0.0` instead of crashing.

**Step 2: Run test to verify it fails**

Run: `./scripts/python.sh -m pytest backend/tests/api/test_count_lines_persistence.py -k snapshot_none_qty -q`

**Step 3: Write minimal implementation**

Normalize the snapshot/live ERP quantity into a concrete numeric value before calling `float(...)`.

**Step 4: Run test to verify it passes**

Run the same targeted pytest command and confirm PASS.

### Task 2: Security and Search Pipeline Typing Cleanup

**Files:**
- Modify: `backend/api/security_api.py`
- Modify: `backend/api/enhanced_item_api.py`
- Test: `backend/tests/test_simple.py` or nearest existing API tests if needed

**Step 1: Write the failing test**

Add a small regression test that exercises suspicious activity aggregation and enhanced search pagination with integer `offset`/`limit`, ensuring both endpoints still return successfully.

**Step 2: Run test to verify it fails**

Run the narrow pytest target for the new tests.

**Step 3: Write minimal implementation**

Make the aggregation and pipeline types explicit enough for mypy without changing endpoint behavior.

**Step 4: Run test to verify it passes**

Re-run the targeted pytest command and confirm PASS.

### Task 3: Change Detection and Lifespan Type Fixes

**Files:**
- Modify: `backend/services/change_detection_sync.py`
- Modify: `backend/core/lifespan.py`
- Test: `backend/tests/test_sync_management_api.py` and focused lifespan coverage if needed

**Step 1: Write the failing test**

Add a regression test around change-detection sync stats/result shape and a small config test for SQL credential readiness with placeholder passwords.

**Step 2: Run test to verify it fails**

Run the narrow pytest targets and confirm the pre-fix failure.

**Step 3: Write minimal implementation**

Correct the task optionality, bulk-write operation typing, and boolean credential coercion while preserving runtime flow.

**Step 4: Run test to verify it passes**

Re-run the focused tests and confirm PASS.

### Task 4: Cleanup and CI Hardening

**Files:**
- Modify: `scripts/clean.sh`
- Modify: `scripts/clean.ps1`
- Modify: `.gitignore`
- Modify: `.github/workflows/main.yml`

**Step 1: Write the failing test**

Use command-level verification as the executable test here:
- `bash -lc "make clean"`
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\clean.ps1`

Also add a CI step that would fail if those entrypoints regress on Windows.

**Step 2: Run verification to capture current behavior**

Confirm cleanup still succeeds and note that `.venv` traversal is noisy and avoidable.

**Step 3: Write minimal implementation**

Skip virtualenv directories during cleanup, ignore transient repo-local logs/diffs, and add a Windows job that checks the supported entrypoints.

**Step 4: Run verification to verify it passes**

Re-run cleanup commands and inspect `git status --short`.

### Task 5: Final Verification

**Files:**
- No new files

**Step 1: Run targeted verification**

- `./scripts/python.sh -m pytest <focused targets>`
- `./scripts/python.sh -m mypy backend --ignore-missing-imports --python-version=3.11`

**Step 2: Run broader verification**

- `bash ./scripts/agent_ci.sh ci`

**Step 3: Report remaining gaps**

If restricted-file mypy errors remain, call them out explicitly instead of editing those files.
