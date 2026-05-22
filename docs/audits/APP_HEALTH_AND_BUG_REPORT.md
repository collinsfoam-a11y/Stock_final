# Stock Verify Application - Health & Bug Report

## Overview
This document assesses the health, architectural alignment, and potential bugs in the Stock Verify application, referencing the plans in `docs/plans/2026-05-16-enterprise-stock-verify-sprint-blueprint.md` and the architecture defined in `docs/architecture/`.

## Architecture Alignment Assessment

**Target Architecture Summary:**
- Offline-First, Mongo-Primary.
- ERP (SQL Server) is read-only.
- Event-sourced verification via `count_lines`.
- Immutable session snapshots at start (ERP frozen baseline).
- Policy-driven approval workflow.

### Gaps vs. Target Architecture
1. **Approval Policy Engine (Blueprint Goal #4):**
   - The codebase (e.g., `sync_batch_api.py`) hardcodes variance percentages for risk flags (e.g., `variance_percent > 50 -> "LARGE_VARIANCE"`).
   - *Gap:* The blueprint states "Externalize policy tables and role routing" and "business logic must not hardcode static thresholds". Currently, it is completely hardcoded.
2. **Serialization & Reconciliation Engine (Blueprint Goal #3):**
   - `sync_conflicts_service.py` rejects serialized conflicts entirely (`"SERIAL_CONFLICT_REJECTED"`), instead of employing a reconciliation algorithm.
   - *Gap:* Blueprint requires automated post-session serial reconciliation output.
3. **Session State Normalization (Blueprint Goal #1):**
   - `schemas.py` maps `RECONCILE` to `ACTIVE` internally but presents it as `RECONCILE` to the frontend.
   - The session model still supports legacy paths like `/complete` which are disabled via 410.

## Core Bugs & High Risks Identified

### 1. Silent Failure on Snapshot Creation `(backend/services/snapshot_service.py)`
- **Issue:** In `get_or_create_snapshot()`, if the baseline is missing, the service logs a warning and returns `None` instead of throwing an error or enforcing creation.
- **Risk:** Count lines can be processed without a valid immutable ERP baseline, violating the core immutable snapshot rule (`INVENTORY_RULES`).

### 2. Timezone Inconsistency in Integrity Check `(backend/api/session_management_api.py)`
- **Issue:** In `check_session_integrity()`, `session["started_at"]` can be either a float or datetime. When converting from a float timestamp, `datetime.fromtimestamp(..., tz=timezone.utc).replace(tzinfo=None)` is used. However, earlier code creates sessions using `datetime.now(timezone.utc).replace(tzinfo=None)`.
- **Risk:** Timezone unaware dates are mixed with UTC assumptions, which may lead to incorrect detection of ERP drift during the session.

### 3. Infinite Retry Loop Risk in Offline Queue `(frontend/src/services/offline/offlineQueue.ts)`
- **Issue:** A patch was applied to stop dropping 5xx errors silently (`item.retries >= 5`). However, `status === 400` drops the item to conflicts immediately. Some backend APIs may return 400 for transient issues.
- **Risk:** 400s (Bad Request) bypass the retry queue and go straight to conflicts, requiring user intervention, even if the error might be resolvable (e.g., token refresh gap).

### 4. Duplicate Count Line Merge Bug `(backend/api/count_lines_routes.py)`
- **Issue:** In `/count-lines/merge`, when `keep_target_qty` is True, it calculates `merged_qty = target_qty + float(source_line.get("counted_qty", 0) or 0)`.
- **Risk:** This acts as an "add" operation rather than a true deduplication merge. If a user scanned an item twice accidentally due to sync lag, merging them adds the quantities together, likely doubling the actual count instead of resolving the duplicate.

### 5. Sync Conflict Batch Splitting `(backend/services/sync_conflicts_service.py)`
- **Issue:** In `_apply_resolved_data`, when merging batches during a conflict, the strategy is `batch_split`. It just appends `additive_batches` to `existing_batches`.
- **Risk:** No logic handles updating the total `counted_qty` to reflect the newly merged batch quantities, potentially desyncing `counted_qty` from the sum of the batches.

## Pre-Commit Checklist & Recommendations

To reach production readiness as defined by the sprint blueprint:
1. **Refactor Risk Flags:** Move hardcoded thresholds from `sync_batch_api.py` into a configuration collection in MongoDB.
2. **Fix Snapshot Enforcement:** Update `snapshot_service.py` to hard-fail count operations if no baseline exists.
3. **Fix Merge Math:** Review the logic in `count_lines_routes.py` `merge_count_lines` to ensure it deduplicates (selects one) rather than blindly adding quantities.
4. **Remove Dead Routes:** Clean up legacy 410 endpoints (`/complete`, `/bulk/close`) from the OpenAPI spec.
