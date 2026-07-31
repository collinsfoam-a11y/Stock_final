# Stock Verify Frontend — Upgrade Plan & Benefits Analysis

> **Companion to:** [`UI_UX_REDESIGN_PROPOSAL.md`](UI_UX_REDESIGN_PROPOSAL.md) (the *what/why*) and [`UI_UX_PROPOSAL_AUDIT.md`](UI_UX_PROPOSAL_AUDIT.md) (the *fidelity fixes*).
> **This document:** the *how/when/value* — a sequenced, sized upgrade plan with a benefits case for each phase.

---

## 1. Executive Decision Summary

The upgrade is a **frontend truth-exposure + consolidation** effort, not new business logic (the backend already enforces the domain). Read the table left-to-right to decide what to fund.

| Phase | Effort | Primary benefit | Risk if skipped |
| --- | --- | --- | --- |
| **P0A** Contracts & view models | M | Eliminates the #1 defect class: UI guessing domain truth | Recurring "wrong number on screen" bugs; rework |
| **P0B** Canonical variance panel | M | **Counting accuracy** — staff/supervisors finally see real discrepancy vs ERP movement | False matches, false confidence, wrong adjustments |
| **P0C** Finalization gate + exception router | M–L | **Prevents unsafe completion**; turns errors into actions | Finalized-with-errors; support load from dead-end toasts |
| **P0D** Recount lineage + blind UX | M | **Audit integrity** — defensible recounts | Recount disputes; compliance exposure |
| **P0E** Identity + multi-location | M | **Fewer duplicates & misclassifications** | Inflated/duplicate counts; reconciliation pain |
| **P0F** Baseline/resume + stale-state | S–M | **Temporal integrity**; no stale submits | Wrong-state writes; data corruption |
| **P1** Token + primitive consolidation | M | **Dev velocity + bundle shrink + consistency** | Continued sprawl; slow features; bundle bloat |
| **P2** Scan workspace + nav redesign | L | **Scan speed + fatigue resistance** | Slower counts; operator error under load |
| **P3** Dashboards, polish, motion | M | **Triage at a glance; production feel** | Missed exceptions; lower trust |

**Effort key:** S ≈ 1–3 days · M ≈ 1–2 weeks · L ≈ 2–4 weeks (single engineer; native certification adds device time).

---

## 2. Benefits Framework (what "value" means here)

Value falls into six measurable categories. Every phase is scored against them.

| Benefit category | How it shows up | How to measure |
| --- | --- | --- |
| **Accuracy** | Right numbers, right identity, no false matches | Variance disputes, adjustment reversals, recount rate |
| **Integrity / audit** | Defensible, immutable, provenance-visible | Audit findings, compliance pass rate, recount disputes |
| **Speed** | Fewer taps, faster scans, less scrolling | Items/min, time-to-finish-rack, scan-to-acknowledge latency |
| **Recoverability** | No dead-ends; errors are actionable | Support tickets, "stuck session" incidents |
| **Engineering velocity** | One primitive set, one token source | Feature lead time, PR review size, bug regressions |
| **Performance/cost** | Smaller bundle, smoother on low-end Android | Bundle KB, FPS during scan, cold-start time |

---

## 3. Phased Plan (tasks, entry/exit, dependencies)

### Phase P0A — API contracts & view-model layer *(do first)*

**Why first:** every later phase depends on a faithful DTO→view-model pipeline. Without it, screens re-interpret backend objects and drift.

- **Tasks**
  1. Inventory authoritative endpoints + response shapes (variance, recount, approval×3, identity, exceptions, sync-conflict, baseline-integrity, finalization-assessment).
  2. Confirm the **canonical variance source** = [`sql_variance_engine.py`](../Stock_final/backend/services/sql_variance_engine.py) (`audit_delta`, `operational_delta`, `movement_adjusted_expected`); decide per-screen which surface is authoritative and document the non-canonical [`reconciliation_api.py`](../Stock_final/backend/api/reconciliation_api.py) fields.
  3. Build adapters → view models (`VarianceViewModel`, `RecountViewModel`, `FinalizationGateViewModel`, `InventoryIdentityViewModel`, `ApprovalViewModel`, `SyncStateViewModel`, `BaselineIntegrityViewModel`, `ExceptionViewModel`).
  4. Add the **authority-boundary ESLint guard** (no frontend recomputation of reconciliation/finalization eligibility).
- **Entry:** audit doc accepted. **Exit:** no screen reads raw DTOs; guard is green. **Depends on:** nothing.

### Phase P0B — Canonical variance panel + provenance

- **Tasks**
  1. Replace single-variance display with the canonical model: baseline · movement-adjusted-expected · `sql_qty_at_submission` · physical → **audit_delta**, **operational_delta**, **shortage/excess**.
  2. Provenance row per value (source + timestamp; distinguish live-SQL vs cached ERP — VI-01).
  3. Absence-vs-zero rendering (`0` vs `—` vs `Pending` vs `Unavailable` vs `stale` vs `N/A`); `PENDING_SQL_VALIDATION` state.
  4. Fixed labels across item-detail, variance center, reconciliation, reports.
- **Entry:** P0A view models. **Exit:** acceptance criteria 5, 11, 13 pass.

### Phase P0C — Finalization gate + exception router

- **Tasks**
  1. Consume backend finalization assessment (`allowed` + structured `blockers[]`); render as actionable checklist mapped to FI-01..FI-08 / R9.*.
  2. Build `<ExceptionRouter>` driven by stable codes (never message parsing); add the typed journeys from proposal §14.5.
  3. CTA enabled only when backend says `allowed`; revalidate on submit.
- **Entry:** P0A. **Exit:** criteria 2, 4, 6 pass; no catch-all error toasts on core flows.

### Phase P0D — Recount lineage + blind UX

- **Tasks**
  1. Recount screen as immutable-version flow (not "edit"); version chain `v1→v2→v3` with who/when.
  2. True blind masking — hide (not just mask) prior qty/variance/directional hints; not retained in client state/logs (AR-04).
  3. Surface `RecountComparisonResult` after submit (currently discarded).
  4. Pre-warn on same-user blind recount before the backend 403.
- **Entry:** P0A. **Exit:** criteria 3, 9 pass.

### Phase P0E — Inventory identity + multi-location

- **Tasks**
  1. Disambiguation sheets (batch / MRP / barcode matches); identity chips on scan.
  2. Serialized items: serial-list UI, qty = accepted serial count (CI-06); hide manual entry.
  3. Multi-location as **distribution/relocation** rows, not duplicate variance (R7.1/R7.4).
  4. Split-count entry mode (CI-07); add-quantity command for same-batch-same-location (R7.5).
- **Entry:** P0A. **Exit:** criteria 7 pass; duplicate/misclassification drop.

### Phase P0F — Baseline/resume + stale-state

- **Tasks**
  1. Locked-baseline display on resume (fingerprint + timestamp); no "refresh baseline" action.
  2. Concurrency tokens on all sensitive actions; revalidate-on-submit; render newly-returned blockers on stale response.
  3. Session state visibility (ACTIVE/PAUSED/STALE/FINALIZED).
- **Entry:** P0A. **Exit:** criteria 1, 6, 8, 16 pass.

### Phase P1 — Token + primitive consolidation *(enabler)*

- **Tasks**
  1. Collapse to `unified/` tokens + one primitive per type; delete facades (7 buttons→1, 5 cards→1, 4 inputs→1, 3 headers→1).
  2. **Remove `glass`/`gradient`/`glassmorphism` variants + `AuroraBackground`/`ParticleField`/`PatternBackground`** (violates governance §4.5/5.4).
  3. Promote `governance:ui:strict` + `bundle:web:guard` + `knip` into CI.
  4. Single version constant (today: native shows v2.0.0/v2.5, package is 2.1.0).
- **Entry:** can run in parallel with P0x. **Exit:** one token source, one primitive set, CI gates green.

### Phase P2 — Scan workspace + navigation

- **Tasks**
  1. Camera-first scan, <100ms acknowledge (governance §6.1), sticky action bar.
  2. Guidance-mode shell (`<OperationalShell>` ≈ glossary "Guidance mode"): fixed context header + one primary CTA.
  3. Per-role tab bars; reconcile web/native splits; virtualized lists (FlashList) for variance/session/item lists (§10).
- **Entry:** P1 primitives. **Exit:** scan-to-acknowledge ≤100ms; no unbounded ScrollView on operational lists.

### Phase P3 — Dashboards, polish, motion

- **Tasks**
  1. Exception-first dashboards (failed sync, high variance, stuck sessions, overdue recounts) with tap-through.
  2. Big-numeric KPI tiles (verified/damage/shortage value, projection health).
  3. Motion discipline (opacity/transform only; reduced-motion fallback); accessibility audit pass.
- **Entry:** P1. **Exit:** dashboards link to record sets; WCAG AA contrast; reduced-motion verified.

---

## 4. Minimum Viable Upgrade (the 80/20)

If only one pass is funded, do **P0A + P0B + P0C + the P1 quick-wins**. This delivers:

- the correctness foundation (contracts/view models),
- the single highest-value exposure (canonical variance),
- safe completion (finalization gate) + actionable errors (exception router),
- and the cheap consistency wins (delete glass/gradient, fix version string, pin action bar).

**What you get for ~4–6 weeks:** measurably fewer wrong-number bugs, no more "finalized with errors," and a visibly more consistent app — without touching the backend.

---

## 5. Benefits Case (quantified where evidence exists)

### Accuracy & integrity (the big wins)

- **Canonical variance panel (P0B):** today a single variance figure cannot distinguish a real miscount from ERP movement during the count. **Benefit:** supervisors stop chasing phantom variances and stop auto-adjusting against the wrong baseline. Directly removes the "false match / false confidence" failure mode (audit Correction 1).
- **Finalization gate (P0C):** maps to FI-01..FI-08. **Benefit:** eliminates "session finalized with unresolved recounts/conflicts" — a P0 operational blocker under governance §14.
- **Recount blind UX (P0D):** defensible recounts (AR-04/AR-05). **Benefit:** recount disputes and compliance exposure drop; the comparison result is finally shown instead of discarded.

### Speed & fatigue

- **Scan workspace (P2):** <100ms acknowledge + sticky bar + thumb-zone controls (§6.1/6.2/6.7). **Benefit:** higher items/min and fewer wrong-rack/wrong-qty errors under fatigue — the app's stated #1 priority (operational speed).
- **Exception router (P0C):** replaces dead-end toasts with one-tap recovery. **Benefit:** fewer stuck sessions, fewer support escalations.

### Engineering velocity & cost

- **Primitive/token consolidation (P1):** deletes ~470 LOC dead `enhanced*` API code + collapses 7→1 buttons, 5→1 cards. **Benefit:** smaller bundle (the `bundle:web:guard` baseline exists to measure delta), faster feature work, fewer "which component?" decisions, and CI catches regression automatically.
- **Authority-boundary guard (P0A):** **Benefit:** the single highest ROI rule — prevents the recurring "UI recomputed domain truth and drifted" bug class at compile/lint time.

### Trust & adoption

- **Provenance + absence-vs-zero (P0B):** every number shows its source/timestamp; missing is never shown as zero. **Benefit:** operators and auditors trust the screen — discrepancies become explainable, not mysterious.

---

## 6. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Two backend variance surfaces cause confusion | P0A task 2 explicitly designates the canonical source per screen; document the other as deprecated |
| Consolidation breaks screens mid-migration | Keep `legacyCompat` as the sanctioned bridge (governance §4.1); migrate screen-by-screen; CI `governance:ui:changed:strict` per PR |
| Native divergence (web vs native) | Share hooks/logic; keep `.web`/`.native` only for true platform rendering; single version constant |
| Stale-state submits | P0F concurrency tokens + revalidate-on-submit; never trust an old "enabled" button |
| Scope creep into backend logic | The authority boundary (§14.1) + ESLint guard make frontend reimplementation a lint error |

---

## 7. Sequencing Rationale

**Contracts before components (P0A first).** The external review's strongest warning: if component work precedes the contract inventory, design agents invent temporary frontend calculations that become permanent. P0A prevents that permanently with a lint guard.

**Exposure before polish (P0B–P0F before P2–P3).** Showing correct data faithfully outranks making it pretty. A beautiful scan screen showing the wrong variance is worse than an ugly one showing the right one.

**Consolidation as a parallel enabler (P1).** Token/primitive consolidation can run alongside P0x and unblocks P2/P3, so it doesn't sit on the critical path.

**Native certification is its own gate.** Web checks (`typecheck`/`lint`/`build:web`) do **not** certify native — real Android/iOS device evidence is required before claiming native readiness (governance §12.6).

---

## 8. Recommended Validation Per Phase

Reuse the repo's existing tooling (governance §12.6):

- `npm run typecheck` · `npm run lint` · `npm test`
- `npm run governance:ui:changed:strict` (per-PR) · `npm run governance:ui:report`
- `npm run bundle:web:report` (measure bundle delta)
- `make agent-ci` for repo-wide validation
- Acceptance criteria from proposal §17 as the phase exit gate

---

**Bottom line:** fund **P0A→P0C + P1 quick-wins** for the strongest benefit-to-effort ratio. The full P0A–P3 sequence converts the app from "feature-rich but inconsistent" into a faithful, legible, race-safe projection of an already-correct backend — with measurably fewer accuracy/integrity defects and faster warehouse throughput.
