# Enterprise Performance Recovery + Operational Scalability Audit

Date: 2026-05-08  
Repo: `/Users/noufi1/stk_final/Stock_final`

## Validation Evidence (This Phase)

- `cd frontend && npm run typecheck`: **PASS**
- `cd frontend && npm run governance:ui:test`: **PASS**
- `cd frontend && npm run governance:runtime:test`: **PASS**
- `cd frontend && npm run governance:runtime:health:strict-advisory`: **PASS**
- `cd frontend && npm run deps:guard`: **PASS**
- `cd frontend && npm test -- src/services/__tests__/syncBatch.test.ts src/bootstrap/initApp.test.ts --runInBand`: **PASS (13 tests)**
- `cd frontend && npm run build:web`: **PASS**
- `cd frontend && npm run bundle:web:guard`: **PASS**
- `cd frontend && npm run bundle:web:report:json`: **PASS**

---

## A. Performance Recovery Report

### What changed

1. **Listener/Polling consolidation**
- Added shared poller service: `frontend/src/services/syncStatusPolling.ts`
- Rewired both status surfaces to shared poller:
  - `frontend/src/components/SyncStatusBar.tsx`
  - `frontend/src/components/ui/SyncStatusPill.tsx`
- Removed duplicated 5s polling loops in those components.

2. **Performance governance enforcement**
- Added bundle regression guard + route chunk metrics:
  - `frontend/scripts/check-web-bundle-regression.cjs`
  - baseline: `reports/web-bundle-baseline.json`
- Added dependency regression guard:
  - `frontend/scripts/check-dependency-regression.cjs`
  - baseline: `reports/dependency-baseline.json`
- Extended runtime convergence metrics for scheduler sprawl:
  - `frontend/scripts/check-runtime-convergence.cjs`
  - baseline extended: `reports/runtime-convergence-baseline.json`

3. **CI enforcement**
- `frontend/package.json` new scripts:
  - `bundle:web:guard`, `bundle:web:report:json`, `deps:guard`
- Workflow gates added:
  - `.github/workflows/pr-checks.yml`
  - `.github/workflows/main.yml`

### Measured deltas

- **setInterval usage count**: `21 -> 20` (repo-wide scan metric)
- **addEventListener usage count**: `15 -> 15` (unchanged)
- **AppState listeners**: `4 -> 4` (unchanged)
- **Interval owner files**: `19` (now explicitly budgeted and enforced)
- **Sync status polling wakeups when both status UIs mount**:  
  `2 loops @ 5s -> 1 shared loop @ 5s` (50% reduction for that surface)

### Bundle/chunk metrics (current)

From `bundle:web:report:json`:
- Bundle files: **67**
- Total JS: **4003.07 kB**
- Main bundle: **1976.82 kB**
- Common bundle: **1474.91 kB**
- Route chunk total: **375.17 kB**
- Largest route chunk: **27.63 kB**

### Startup/rerender/wakeup interpretation

- **Startup latency trend**: no material improvement yet (bundle still oversized).
- **Rerender pressure**: reduced on sync status surfaces by shared polling + cached broadcast.
- **Wakeup pressure**: reduced on sync status surfaces; global timers still high.

---

## B. Hot-Path Ownership Map

### Critical operational paths and canonical owners

1. **Scan loop + item submit path**
- Owner: `frontend/app/staff/scan.screen.tsx` + inventory domain hooks/services
- Priority: highest (warehouse throughput path)

2. **Offline sync + reconnect path**
- Canonical sync orchestrator: `frontend/src/services/syncService.ts`
- Queue lifecycle owner: `frontend/src/services/offline/offlineQueue.ts`
- Reconnect authority: `initializeSyncService()` in `syncService.ts`

3. **Sync status UI polling**
- Canonical owner: `frontend/src/services/syncStatusPolling.ts`
- Consumers: `SyncStatusBar`, `SyncStatusPill`

4. **Notification polling**
- Owner: `frontend/src/store/notificationStore.ts`

5. **Connection health monitoring**
- Owner: `frontend/src/services/connectionManager.ts`

---

## C. Operational Scalability Report

### Long-session survivability

- Improved in sync-status surface due duplicated polling removal.
- Still constrained by total timer/listener surface and oversized JS footprint.

### Low-end Android stability

- Positive:
  - canonical sync ownership already enforced
  - duplicate status polling removed
- Remaining constraints:
  - main bundle still ~1.98MB
  - many interval owners remain (19 files)
  - several heavy orchestration modules remain unsplit

### Memory stability

- Better around sync-status UI polling lifecycle (single shared poller, subscriber-based stop/start).
- No full plateau proof yet; memory-pressure instrumentation still needs broader runtime telemetry.

### Reconnect resilience

- Maintained (no regressions in sync tests).
- Reconnect ownership remains canonical in `syncService.ts`.

### Scan-loop throughput

- Not regressed by this phase.
- Still needs dedicated profiling + decomposition around scan screen and workflow APIs.

---

## D. Module Decomposition Plan

### 1) `backend/api/count_lines_routes.py`
- Complexity drivers: route sprawl, mixed orchestration/validation/response shaping.
- Boundaries: split by operation family (read/report/write/recount), shared request guards, response adapters.
- Risk: medium (API surface wide); preserve route signatures.
- Sequence: extract non-route logic first, then thin route handlers.

### 2) `backend/api/session_management_api.py`
- Complexity drivers: lifecycle transitions + auth/role/validation + side effects.
- Boundaries: session transition service, request schema adapters, transport-layer error map.
- Risk: high; requires regression-focused transition tests.

### 3) `backend/services/count_line_write_service.py`
- Complexity drivers: mixed domain rules, retry/idempotency concerns, persistence orchestration.
- Boundaries: validation pipeline, dedupe policy, persistence adapter, audit event emission.
- Risk: high (write path); must keep deterministic idempotency behavior.

### 4) `frontend/src/services/api/inventoryWorkflowApi.ts`
- Complexity drivers: API breadth + transformation overlap + retry/error concerns.
- Boundaries: scan, session, reconciliation, reporting clients; shared retry/interceptor layer.
- Risk: medium; requires contract snapshot tests.

### 5) `frontend/src/screens/staff/StaffHomeScreen.tsx`
- Complexity drivers: data fetch, UI orchestration, action handlers in one file.
- Boundaries: data hooks, action controllers, pure presentational sections.
- Risk: medium; must preserve task-speed ergonomics.

### 6) `frontend/src/store/authStore.ts`
- Complexity drivers: auth/session/pending-redirect/heartbeat concerns in one store.
- Boundaries: auth persistence, token/session lifecycle, redirect policy, heartbeat manager.
- Risk: medium-high; preserve redirect invariants.

### 7) `frontend/src/styles/scanStyles.ts`
- Complexity drivers: oversized style matrix + mixed operational modes.
- Boundaries: screen sections + tokenized style factories per section.
- Risk: low-medium; use visual snapshot checks.

---

## E. Runtime Performance Governance Report

### New budgets and controls

1. **Bundle budgets (regression ceilings)**
- Enforced by `check-web-bundle-regression.cjs`
- Baseline: `reports/web-bundle-baseline.json`
- Hard fail in CI via `npm run bundle:web:guard`

2. **Dependency growth budgets**
- Enforced by `check-dependency-regression.cjs`
- Baseline: `reports/dependency-baseline.json`
- Hard fail in CI via `npm run deps:guard`

3. **Runtime scheduler/listener budgets**
- Enforced by `check-runtime-convergence.cjs`
- Baseline: `reports/runtime-convergence-baseline.json`
- Budgets include:
  - `setIntervalCount`
  - `addEventListenerCount`
  - `appStateAddListenerCount`
  - `intervalOwnerFileCount`
  - sync orchestrator ownership invariants

### New regression outputs

- Route-level chunk metrics report:
  - `reports/web-bundle-regression-report.json`
- Top interval owner listing in runtime convergence JSON metrics.

---

## F. Final Scalability Verdict

**Verdict: operationally survivable but performance-constrained.**

Why:
- Runtime governance and CI enforcement are materially stronger.
- Duplicate polling was reduced on an active operational surface.
- Canonical runtime ownership stayed intact.

But scalability criteria are not fully met yet:
- Runtime weight is not trending down enough (main bundle still ~1976.8kB).
- Startup latency proxy (bundle weight) remains high.
- Timer/listener ownership remains broad (19 interval-owner files).
- Long-session and low-end Android resilience are improved, not yet stabilized.

---

## Next High-ROI Slice (recommended)

1. Decompose `StaffHomeScreen.tsx` and `inventoryWorkflowApi.ts` to isolate hot path fetch/render logic.
2. Consolidate remaining polling owners into shared scheduler policies (notification, dashboard refresh loops).
3. Add startup-latency and memory-growth runtime telemetry in CI/perf runs (explicit p50/p95 and session-duration budgets).
