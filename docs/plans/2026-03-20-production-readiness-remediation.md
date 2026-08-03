# Production Readiness Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore reliable local verification and make the repository pass its core production-readiness checks on Windows and the current backend stack.

**Architecture:** Fixes are grouped by root cause instead of by failing test count. First remove environment and tooling blockers that distort verification, then fix backend runtime/config regressions, then update tests that no longer match the canonical session architecture, and finally address remaining real behavior regressions.

**Tech Stack:** FastAPI, Starlette, Motor/MongoDB, pytest, mypy, Expo, Jest, TypeScript, PowerShell

---

### Task 1: Stabilize local verification commands

**Files:**
- Modify: `frontend/package.json`
- Modify: `backend/requirements.dev.txt`
- Test: `frontend/package.json`
- Test: `backend/requirements.dev.txt`

**Step 1: Write the failing test**

Reproduce:
- `cd frontend && npm test -- --runInBand`
- `backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.dev.txt`

Expected:
- Frontend test command fails in PowerShell because `NODE_ENV=test` is Unix-only.
- Backend dev install fails because `copilotkit` conflicts with the pinned FastAPI version.

**Step 2: Run test to verify it fails**

Run:
- `cd frontend && npm test -- --runInBand`
- `backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.dev.txt`

**Step 3: Write minimal implementation**

- Make frontend test scripts Windows-compatible.
- Remove or guard the conflicting backend dev dependency so the declared dev environment is installable again.

**Step 4: Run test to verify it passes**

Run:
- `cd frontend && npm test -- --runInBand`
- `backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.dev.txt`

**Step 5: Commit**

```bash
git add frontend/package.json backend/requirements.dev.txt
git commit -m "fix: restore local verification tooling"
```

### Task 2: Fix trusted-host behavior for tests and local development

**Files:**
- Modify: `backend/app/middleware.py`
- Test: `backend/tests/test_auth.py`
- Test: `backend/tests/test_auth_cookie_support.py`
- Test: `backend/tests/test_items.py`

**Step 1: Write the failing test**

Reproduce:
- `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_auth.py::TestLogin::test_login_success -vv`

Expected:
- Request fails with `400 Invalid host header`.

**Step 2: Run test to verify it fails**

Run:
- `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_auth.py::TestLogin::test_login_success -vv`

**Step 3: Write minimal implementation**

- Allow `testserver` during test execution and preserve current production host validation semantics.

**Step 4: Run test to verify it passes**

Run:
- `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_auth.py backend/tests/test_auth_cookie_support.py backend/tests/test_items.py -q`

**Step 5: Commit**

```bash
git add backend/app/middleware.py backend/tests/test_auth.py backend/tests/test_auth_cookie_support.py backend/tests/test_items.py
git commit -m "fix: allow test host under trusted host middleware"
```

### Task 3: Update stale tests for canonical session storage

**Files:**
- Modify: `backend/tests/api/test_session_management_api.py`
- Modify: `backend/tests/governance/test_session_transitions.py`
- Test: `backend/tests/api/test_session_management_api.py`
- Test: `backend/tests/governance/test_session_transitions.py`

**Step 1: Write the failing test**

Reproduce:
- `backend\.venv\Scripts\python.exe -m pytest backend/tests/api/test_session_management_api.py::TestGetSessionDetailEndpoint::test_get_session_detail_success -vv`

Expected:
- `TypeError: object MagicMock can't be used in 'await' expression`

**Step 2: Run test to verify it fails**

Run:
- `backend\.venv\Scripts\python.exe -m pytest backend/tests/api/test_session_management_api.py backend/tests/governance/test_session_transitions.py -q`

**Step 3: Write minimal implementation**

- Align test fixtures and mocks with canonical `db.sessions` reads used by `find_session()`.

**Step 4: Run test to verify it passes**

Run:
- `backend\.venv\Scripts\python.exe -m pytest backend/tests/api/test_session_management_api.py backend/tests/governance/test_session_transitions.py -q`

**Step 5: Commit**

```bash
git add backend/tests/api/test_session_management_api.py backend/tests/governance/test_session_transitions.py
git commit -m "test: align session tests with canonical storage"
```

### Task 4: Fix count-line persistence and session total regressions

**Files:**
- Modify: `backend/api/count_lines_routes.py`
- Modify: `backend/services/canonical_inventory.py`
- Test: `backend/tests/api/test_count_lines_persistence.py`
- Test: `backend/tests/api/test_session_finalization_and_canonical_reads.py`

**Step 1: Write the failing test**

Reproduce:
- `backend\.venv\Scripts\python.exe -m pytest backend/tests/api/test_count_lines_persistence.py -q`

Expected:
- Session totals do not match expected delta behavior and finalized-line protection is inconsistent.

**Step 2: Run test to verify it fails**

Run:
- `backend\.venv\Scripts\python.exe -m pytest backend/tests/api/test_count_lines_persistence.py backend/tests/api/test_session_finalization_and_canonical_reads.py -q`

**Step 3: Write minimal implementation**

- Fix session aggregate updates so they reflect the intended totals model.
- Preserve finalized-session and finalized-line immutability.

**Step 4: Run test to verify it passes**

Run:
- `backend\.venv\Scripts\python.exe -m pytest backend/tests/api/test_count_lines_persistence.py backend/tests/api/test_session_finalization_and_canonical_reads.py -q`

**Step 5: Commit**

```bash
git add backend/api/count_lines_routes.py backend/services/canonical_inventory.py backend/tests/api/test_count_lines_persistence.py backend/tests/api/test_session_finalization_and_canonical_reads.py
git commit -m "fix: restore canonical count-line totals and locking"
```

### Task 5: Address remaining backend regressions and verify the stack

**Files:**
- Modify: exact files identified by the remaining failing backend tests
- Test: `backend/tests`
- Test: `frontend/package.json`

**Step 1: Write the failing test**

Reproduce:
- `backend\.venv\Scripts\python.exe -m pytest backend/tests -q`
- `backend\.venv\Scripts\python.exe -m mypy backend --ignore-missing-imports --python-version=3.11`

**Step 2: Run test to verify it fails**

Run:
- `backend\.venv\Scripts\python.exe -m pytest backend/tests -q`
- `backend\.venv\Scripts\python.exe -m mypy backend --ignore-missing-imports --python-version=3.11`

**Step 3: Write minimal implementation**

- Fix residual behavior regressions one root cause at a time.
- Decide whether mypy issues are meant to be fixed now or explicitly downgraded from production-readiness scope with a documented rationale.

**Step 4: Run test to verify it passes**

Run:
- `backend\.venv\Scripts\python.exe -m ruff check backend`
- `backend\.venv\Scripts\python.exe -m mypy backend --ignore-missing-imports --python-version=3.11`
- `backend\.venv\Scripts\python.exe -m pytest backend/tests -q`
- `cd frontend && npm run lint`
- `cd frontend && npm run typecheck`
- `cd frontend && npm test -- --runInBand`

**Step 5: Commit**

```bash
git add .
git commit -m "fix: complete production readiness remediation"
```
