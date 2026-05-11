# Enterprise Runtime Convergence + Architectural Compression Audit

Date: 2026-05-08  
Repo: `/Users/noufi1/stk_final/Stock_final`

## Evidence Baseline (Current Run)

- `cd frontend && npm run governance:runtime:test`: **PASS**
- `cd frontend && npm run governance:runtime:health:strict-advisory`: **PASS**
- `cd frontend && npm run governance:ui:test`: **PASS**
- `cd frontend && npm run governance:ui:health:json`: **PASS**
- `cd frontend && npm test -- src/services/__tests__/syncBatch.test.ts src/bootstrap/initApp.test.ts --runInBand`: **PASS (13 tests)**
- `cd frontend && npm run typecheck`: **PASS**
- `cd frontend && npm run build:web && npm run bundle:web:report`:
  - Web bundles: **67**
  - Total JS: **4002.0 kB**
  - Main bundle: **1976.8 kB**
  - Budget status: **OVER by 1476.8 kB**

## Net Changes Executed in This Phase

1. Sync runtime unification:
- Canonical scheduler moved to `frontend/src/services/syncService.ts`
- `frontend/src/services/offline/syncService.ts` converted to compatibility shim (no scheduler ownership)
- `frontend/src/bootstrap/initMobileRuntime.ts` switched to canonical sync service import only

2. Runtime feedback consolidation:
- `frontend/src/components/ui/Toast.tsx` converted to compatibility wrapper over `components/feedback/Toast`
- Canonical notification flow remains `ToastProvider + toastService`

3. Wrapper retirement:
- Removed pure re-export wrapper `frontend/src/services/utils/toastService.ts`

4. Governance evolution:
- Added `frontend/scripts/check-runtime-convergence.cjs`
- Added `frontend/scripts/check-runtime-convergence.test.cjs`
- Added `reports/runtime-convergence-baseline.json`
- Added CI/runtime scripts in `frontend/package.json`
- Added runtime convergence CI gates in:
  - `.github/workflows/pr-checks.yml`
  - `.github/workflows/main.yml`

## 11) Codebase Health Audit

### Verified strengths

- Duplicate runtime sync scheduling is now structurally collapsed to one owner.
- Runtime compatibility wrappers for sync/toast are explicit and measurable.
- Governance hard gates are active for both UI and runtime convergence drift.
- No regression in targeted sync behavior or bootstrap tests.

### Verified entropy signals still present

- High legacy theme bridge usage remains (`legacyCompat` references: 125).
- Large mixed token surface remains (`modernDesignSystem` references: 54).
- Runtime timer/listener density remains high at repo level (`setInterval`: 21, `addEventListener`: 15).
- Bundle remains operationally oversized for low-end Android (`1976.8 kB` main web bundle).

## 12) File Structure + Repository Organization

### Current state

- Domain layout is coherent (`app`, `src/services`, `src/store`, `src/domains`), but ownership is still diluted by compatibility layers.
- Script/tooling sprawl remains high at repository root (`scripts/` large legacy + one-off surface).
- Large modules still centralize orchestration (`count_lines_routes.py`, `session_management_api.py`, `count_line_write_service.py`, `authStore.ts`, `scanStyles.ts`, `inventoryWorkflowApi.ts`, `StaffHomeScreen.tsx`).

### Structural risk

- Onboarding remains medium-friction due to overlapping old/new paths.
- Canonical path discoverability is improving in runtime services, but not yet broadly consistent across theme/UI domains.

## 13) Wiring + Integration Validation

### Converged wiring (validated)

- Mobile runtime bootstrap now pulls sync lifecycle from a single canonical module.
- Offline sync compatibility bridge is shim-only and no longer owns scheduler/listener logic.
- Legacy UI toast path resolves into canonical feedback toast rendering.

### Residual wiring ambiguity

- Theme/token runtime still traverses multiple bridges (`legacyCompat`, `themeTokens`, `modernDesignSystem` consumers).
- Additional periodic/listener systems exist outside sync path (notifications, session timers, performance hooks).

## 14) Duplication + Entropy Detection

### Harmless duplication

- Thin compatibility wrappers with explicit canonical targets and drift guards.

### Dangerous duplication

- Theme/token dual-stack behavior on hot paths.
- Repeated interval/listener patterns across multiple services/screens.

### Operational-risk duplication

- Parallel timer-driven refresh and polling behaviors can still compound wakeups under long sessions.

### Governance-risk duplication

- Legacy imports remain high enough to slow retirement velocity without strict migration budgets.

## 15) Cleanup + Retirement Analysis

### Classification (current high-value set)

1. `frontend/src/services/utils/toastService.ts`
- Status: **removed**
- Why: pure re-export wrapper, no behavior.
- Risk: low.

2. `frontend/src/services/offline/syncService.ts`
- Status: **compatibility-only (shim)**
- Why: preserve legacy import stability for one release cycle.
- Risk: low if shim remains behavior-free.

3. `frontend/src/components/ui/Toast.tsx`
- Status: **compatibility-only (shim)**
- Why: preserve compatibility while enforcing canonical feedback rendering path.
- Risk: low-medium (legacy `action` prop behavior intentionally unsupported).

4. `frontend/src/theme/legacyCompat.ts`, `frontend/src/theme/auroraTheme.ts`, `frontend/src/theme/uiStandard.ts`
- Status: **quarantine**
- Why: still active in many operational surfaces.
- Risk: medium-high if removed before migration.

### Safe retirement order

1. Remove behaviorless re-export wrappers (already started).
2. Keep compatibility shims for one release cycle with hard drift checks.
3. Retire high-volume legacy theme imports by feature slice.
4. Remove quarantine theme bridges after import counts hit zero and one cycle of stable metrics.

## 16) Performance Waste Analysis

### Measured current state

- Main bundle remains **1976.8 kB** (target remains < 900kB for sustained low-end stability).
- Timer/listener usage remains high at repo scale.

### Phase contribution

- Sync scheduler ownership compressed from two runtime owners to one canonical owner.
- This reduces duplicate wake scheduling risk in sync path, but does not yet materially reduce global bundle or total listener count.

## 17) Architectural Entropy Analysis

### Direction

- **Local convergence in runtime orchestration**
- **Global entropy still elevated**

### Entropy velocity (current estimate)

- Retirement throughput increased this phase (sync/toast/wrapper + new CI budgets).
- Entropy inflow remains significant due to unresolved legacy theme adoption and oversized modules.
- Net: **improving, but not yet below entropy inflow**.

## 18) AI-Agent Safety Audit

### Improvements landed

- Canonical runtime ownership is now explicit and enforced by runtime convergence CI.
- Compatibility wrappers are classified and measurable.

### Remaining AI-safety risks

- High legacy token/theme ambiguity still increases wrong-path edit probability.
- Oversized orchestrator modules still raise side-effect risk for parallel agent edits.

## 19) Refactor + Optimization Opportunities (Highest ROI)

1. Legacy theme import burn-down (`legacyCompat` -> `useUiTokens/themeTokens`) by route/domain slice.
2. Interval/listener policy extraction to shared scheduler utilities for notification/session/perf hooks.
3. Decompose oversized modules named above with clear domain boundaries.
4. Bundle program: dead export removal + dependency trim + route-level lazy-load tightening.
5. Script/tool manifest and archival policy for root `scripts/` sprawl.

## 20) Codebase Health Scorecard (0-10)

- Repository organization: **6.2**
- Architectural cleanliness: **6.9**
- Duplication control: **5.8**
- Governance sustainability: **8.5**
- Entropy resistance: **6.1**
- AI-agent safety: **6.8**
- Cleanup readiness: **7.4**
- Optimization maturity: **5.0**
- Module cohesion: **5.6**
- Integration consistency: **8.0**

## 21) Final Entropy Verdict

**Verdict: still diverging at macro level, but runtime convergence is now measurable and enforced.**

Reason:
- Migration patterns improved for sync/toast runtime ownership.
- Governance evolved from advisory-only to explicit runtime budget checks.
- Wrapper debt shrank (one wrapper removed, two duplicates collapsed into shims).
- Bundle trend is still flat/oversized, and legacy theme imports remain high.
- Module-size and timer/listener complexity remain above sustainable thresholds.

---

## A) Canonical Runtime Map

- Canonical systems:
  - Sync orchestrator: `frontend/src/services/syncService.ts`
  - Queue lifecycle owner: `frontend/src/services/offline/offlineQueue.ts`
  - Runtime bootstrap wiring: `frontend/src/bootstrap/initMobileRuntime.ts`
  - Notification rendering: `frontend/src/components/feedback/ToastProvider.tsx`
  - Toast event source: `frontend/src/services/toastService.ts`
- Deprecated systems:
  - `frontend/src/services/offline/syncService.ts` (compatibility shim)
  - `frontend/src/components/ui/Toast.tsx` (compatibility shim)
- Quarantined systems:
  - `frontend/src/theme/legacyCompat.ts`
  - `frontend/src/theme/auroraTheme.ts`
  - `frontend/src/theme/uiStandard.ts`
- Unresolved ambiguity:
  - token/theme authority still split across legacy and modern consumers

## B) Entropy Reduction Report

- Wrappers removed: **1** (`frontend/src/services/utils/toastService.ts`)
- Duplicate runtime systems collapsed: **2**
  - sync scheduler ownership collapsed to one owner
  - UI toast implementation collapsed to canonical feedback toast
- Listener/polling simplification:
  - sync scheduler owner count: **2 -> 1** (enforced by hard gate)
- Governance compression progress:
  - added runtime convergence hard/advisory budgets with CI enforcement
- Bundle reduction:
  - **no material improvement yet** (main bundle remains ~1976.8 kB)

## C) Compatibility Retirement Plan

1. `services/offline/syncService.ts`
- Classification: compatibility-only
- Readiness: removable after one release with zero import regressions
- Rollback: restore shim file
- Dependency impact: low

2. `components/ui/Toast.tsx`
- Classification: compatibility-only
- Readiness: removable after import freeze and no `action` consumers
- Rollback: keep shim on branch
- Dependency impact: low-medium

3. `theme/legacyCompat.ts`, `theme/auroraTheme.ts`, `theme/uiStandard.ts`
- Classification: quarantine
- Readiness: not removable yet
- Rollback: not applicable now (still active)
- Dependency impact: high

## D) Operational Performance Report

- Bundle impact: unchanged, still above operational target.
- Polling/listener reduction: sync-owner reduction landed; global timer/listener count still high.
- Startup/runtime simplification: canonical sync bootstrap path now deterministic.
- Low-end Android outlook: improved sync determinism, but bundle/timer density still a blocker for long-session resilience.

## E) AI-Agent Safety Report

- Ambiguity reduction:
  - sync ownership and toast runtime path now explicit
  - compatibility surfaces now classified with machine checks
- Canonical-path clarity:
  - hard gate prevents reintroduction of duplicate sync orchestrators
- Ownership clarity:
  - runtime ownership improved in sync/feedback domain
- Residual risk:
  - theme/token path ambiguity and oversized modules still moderate-high

## F) Final Convergence Verdict

**Retirement velocity does not yet exceed entropy inflow.**

Convergence criteria status:
- Duplicate runtime systems shrink: **yes (this phase)**
- Wrappers shrink: **yes (this phase)**
- Bundle trend downward: **no**
- Module complexity trend downward: **not yet**
- Canonical execution path clarity: **improving, not complete**

Overall determination: **not yet converging end-to-end; trending in the correct direction with enforceable runtime compression controls now in place.**
