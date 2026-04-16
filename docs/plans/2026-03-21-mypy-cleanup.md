# Mypy Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce the remaining standalone mypy backlog to a production-meaningful signal and clean the highest-value runtime typing errors.

**Architecture:** First align mypy with the repo's real enforcement scope by removing known noise sources that are not shipped in production. Then fix the runtime modules that still fail under that narrower check, prioritizing repeated patterns and high-error files over one-off cleanup.

**Tech Stack:** Python 3.11, mypy, FastAPI, Pydantic, Motor, repo-local shell verification.

---

### Task 1: Baseline the backlog

**Files:**
- Modify: `docs/plans/2026-03-21-mypy-cleanup.md`
- Reference: `backend/pyproject.toml`
- Reference: `mypy_latest.txt`

**Step 1: Capture the current mypy command and failure count**

Run: `backend\.venv\Scripts\python.exe -m mypy backend --ignore-missing-imports --python-version=3.11`
Expected: large failure set with repeated cluster patterns.

**Step 2: Group failures by module and error shape**

Use shell grouping to identify the highest-volume files and repeated diagnostics.

**Step 3: Record the intended scope**

Treat production runtime modules as higher priority than test harnesses, evaluation tooling, and ad hoc scripts.

### Task 2: Remove configuration-driven noise

**Files:**
- Modify: `backend/pyproject.toml`

**Step 1: Add mypy settings that reflect the legacy codebase**

Use explicit configuration instead of relying on shifting mypy defaults.

**Step 2: Exclude non-production typing noise**

Limit the default pass to runtime code, not evaluation harnesses or one-off scripts.

**Step 3: Re-run mypy**

Run: `backend\.venv\Scripts\python.exe -m mypy backend --ignore-missing-imports --python-version=3.11`
Expected: materially smaller failure set focused on runtime modules.

### Task 3: Fix runtime type clusters

**Files:**
- Modify: `backend/exceptions.py`
- Modify: `backend/services/errors.py`
- Modify: `backend/utils/result_types.py`
- Modify: `backend/api/master_settings_api.py`
- Modify: `backend/utils/structured_logging.py`
- Modify: other high-signal runtime files as needed from the rerun

**Step 1: Fix repeated optional-default signatures**

Use `| None` or `Optional[...]` where `None` is a real default.

**Step 2: Fix generic `Result` narrowing issues**

Make success/error branches explicit so mypy can prove the return types.

**Step 3: Fix model-construction and data-shape mismatches**

Prefer typed defaults or `model_validate` style helpers over under-specified dict construction.

**Step 4: Re-run focused mypy after each cluster**

Use file-scoped commands before the full repo command.

### Task 4: Final verification

**Files:**
- Reference: `backend/pyproject.toml`
- Reference: touched runtime modules

**Step 1: Run full mypy**

Run: `backend\.venv\Scripts\python.exe -m mypy backend --ignore-missing-imports --python-version=3.11`
Expected: zero errors or a clearly reduced, isolated runtime remainder.

**Step 2: Run repo CI**

Run: `bash ./scripts/agent_ci.sh ci`
Expected: pass.

**Step 3: Report exact residuals if any remain**

If mypy is not fully clean, report the remaining file count and why the remaining items were not safe to batch-fix in this pass.
