# UI/UX Redesign Proposal — Audit Against Existing System

> **Purpose:** Cross-check [`plans/UI_UX_REDESIGN_PROPOSAL.md`](UI_UX_REDESIGN_PROPOSAL.md) against the repo's own source-of-truth docs and backend code, to find inaccuracies and gaps.
>
> **Sources reviewed:**
>
> - [`Stock_final/docs/AGENT_UI_UX_RULES.md`](../Stock_final/docs/AGENT_UI_UX_RULES.md) — repo-level UI/UX governance
> - [`Stock_final/docs/product/requirements.md`](../Stock_final/docs/product/requirements.md) — R1–R9
> - [`Stock_final/docs/product/workflow-invariants.md`](../Stock_final/docs/product/workflow-invariants.md) — SI/CI/VI/OC/AR/DI/FI
> - [`Stock_final/docs/product/glossary.md`](../Stock_final/docs/product/glossary.md) — canonical terminology
> - [`Stock_final/backend/services/sql_variance_engine.py`](../Stock_final/backend/services/sql_variance_engine.py) — canonical variance math
>
> **Note:** `AGENT_MEMORY.md` (cited by the external review) is **not present in this workspace** — it is external context, not a missed file.

---

## Verdict

The proposal is **strategically aligned** with the governance docs (token consolidation, delete glass/aurora/particle, scan-first, offline visibility, accessibility, motion discipline — all match §3–§10 of `AGENT_UI_UX_RULES.md`). However, one **material inaccuracy** and **several real gaps** were found where the proposal diverges from the canonized domain model.

---

## 🔴 CORRECTION 1 (material) — Variance model used the wrong surface

**Proposal claim (§14.4):** feature a three-number panel using `count_variance` / `erp_drift` / `final_gap`.

**Actual canonical model** (glossary + R4 + [`sql_variance_engine.py`](../Stock_final/backend/services/sql_variance_engine.py)):

| Canonical term | Formula | Source |
| --- | --- | --- |
| **quantity_delta** | `physical_qty − expected_qty` | R4.1 / VI-02 |
| **shortage_qty** | `max(expected − physical, 0)` | R4.2 / VI-03 |
| **excess_qty** | `max(physical − expected, 0)` | R4.3 / VI-03 |
| **audit_delta** | `total_physical − frozen_baseline` | glossary / `sql_variance_engine.py:31` |
| **movement_adjusted_expected** | `baseline + inbound − outbound + approved adjustments` | glossary |
| **operational_delta** | `total_physical − movement_adjusted_expected` | glossary / `sql_variance_engine.py:34` |

**The problem:** the proposal's `erp_drift`/`final_gap` come from [`reconciliation_api.py`](../Stock_final/backend/api/reconciliation_api.py) — a **second, non-canonical** variance surface. The glossary canonizes `audit_delta` / `operational_delta`. The proposal **entirely missed**:

- the **movement-adjusted-expected** dimension (external stock movement *during* the count),
- the **operational_delta** (the true counting-accuracy signal after accounting for movements),
- the **shortage/excess split** (R4.2/R4.3 — variance must decompose into shortage vs excess, not a single signed number).

**Fix:** the variance panel must use canonical terms and surface **audit_delta**, **operational_delta** (vs movement-adjusted-expected), and the **shortage/excess decomposition**. Reconcile the two backend surfaces (decide which is authoritative per screen; the glossary says `sql_variance_engine` is canonical). This is the single most important correction — the praised "three-number panel" was actually incomplete versus the real domain model.

---

## 🟠 GAP 1 — Mandatory remark on every submitted item (CI-03 / R2.3)

**Missed.** Every submitted item requires a remark. The scan/submission UI must make the remark a **mandatory** field and block submit without it. (The backend already enforces "remark mandatory on every count-line write" — see `test_transactional_write_enforcement.py`.) Add to scan-flow + submission-gate contracts.

## 🟠 GAP 2 — UOM precision is backend-enforced, not frontend (CI-05 / R2.5)

**Missed nuance.** The qty input should *display* UOM precision (decimal places per unit) but must **not** enforce it — the backend enforces (R2.5). The proposal's qty steppers should reflect precision for display only.

## 🟠 GAP 3 — Split count (CI-07)

**Missed entirely.** Counts can be structured split counts: carton/loose lines with `type`, `count`, `units_per_group`, `total`. The scan/item UI needs a split-count entry mode. No mention in the proposal.

## 🟠 GAP 4 — Negative quantity vs negative variance conflation (CI-02 / R2.2)

**Inaccuracy.** The proposal said "negative stock is always visible and red." But:

- **Negative physical quantity input is rejected** (CI-02 / R2.2).
- **Shortage (negative variance/delta) is valid and shown red** (R4.1).
These are different. The UI must reject negative *entered* quantities while validly displaying negative *deltas*.

## 🟠 GAP 5 — Session state machine not surfaced (SI-05 / SI-06 / R1.5)

**Missed.** Sessions have real states: `ACTIVE`, `PAUSED` (distinct from ACTIVE — SI-05), `STALE` (after 60 min no heartbeat — SI-06), `FINALIZED`. The proposal's session UX didn't expose PAUSED/STALE. These must be visible states in the session shell.

## 🟠 GAP 6 — Auto-approval UX (AR-02 / AR-03 / R6.2 / R6.3)

**Missed.** Auto-approval requires **ALL** conditions simultaneously (delta=0, no mismatches, remark present, evidence policy satisfied); a threshold must **never** auto-approve a non-zero variance merely because it is small. The approval UI must show *why* auto-approval did or did not occur (condition checklist), not just a binary approve/reject.

## 🟠 GAP 7 — Self-approval prevention (SI-01 / AR-01 / R6.1)

**Missed explicit statement.** Staff cannot approve their own observations. The approval UI must prevent/hide self-approval (backend enforces; UI should not even offer it).

## 🟠 GAP 8 — Finalization gate incomplete vs canon (FI-01..FI-08 / R9.1..R9.9)

**Partial.** The proposal's finalization checklist must map to the canonical invariants and currently misses:

- all commands acknowledged (R9.2 / FI-03),
- no blocked sync records (R9.3),
- no pending SQL validation (R9.5 / FI-04),
- projections match (R9.8 / FI-08),
- rack locks released only after finalization (R9.9).

Rewrite the gate as the canonical FI-*/ R9.* list.

## 🟡 GAP 9 — Serial uniqueness scope (glossary)

**Imprecise.** Serial uniqueness is **per item within a master session, not global** (glossary: "Serial uniqueness: Scoped per item within a master session"). The proposal's `SERIAL_CONFLICT` exception must state this scope precisely.

## 🟡 GAP 10 — Duplicate governance precision (R7.1–R7.5)

**Imprecise.** The exception table should cite R7 exactly:

- R7.1 same item, different locations → allowed + aggregated,
- R7.2 same item twice in same location session → blocked **unless split-count continuation**,
- R7.3 duplicate serials → blocked or quarantined, never merged,
- R7.4 same physical batch, different locations → allowed,
- R7.5 same physical batch twice in same location → requires explicit add-quantity command.

The split-count continuation exception (R7.2) and add-quantity command (R7.5) are currently missing.

## 🟡 GAP 11 — Physical batch identity definition (glossary)

**Imprecise.** Canonical **physical batch** = `item_code + physical batch number + MRP + manufacturing date + expiry date`. **Condition allocation** (SALEABLE / DAMAGED / EXPIRED) is a separate axis. The proposal's "inventory identity" should align to this exact definition rather than a free-form list.

## 🟡 GAP 12 — `PENDING_SQL_VALIDATION` state (R3.3 / R3.4)

**Missed.** When SQL is unavailable at submission, the observation status becomes `PENDING_SQL_VALIDATION` and the physical observation is **still saved** (R3.4). This is a distinct UI state for the exception router and absence-vs-zero handling.

## 🟡 GAP 13 — Provenance must distinguish SQL sources (R3.1 / R3.2 / VI-01)

**Imprecise.** Provenance must distinguish:

- **baseline** (frozen ERP snapshot at session start),
- **`sql_qty_at_submission`** (live SQL fetched at submission — R3.1),
- cached ERP (must **never** be labelled `sql_qty` — R3.2 / VI-01).
The proposal's provenance section listed "current ERP" generically; it must separate live-SQL-at-submission from cached ERP.

## 🟡 GAP 14 — Terminology: "Guidance mode" already exists (glossary)

**Naming.** The glossary defines **Guidance mode**: "staff counting workflow that presents one decision per screen with fixed context header and primary action." This **is** the proposal's `<OperationalShell>` + one-primary-CTA concept. Adopt the existing term rather than inventing a new name (or explicitly map `<OperationalShell>` → Guidance mode).

## 🟡 GAP 15 — Master session vs location session terminology

**Imprecise.** The domain has a clear two-tier model: **master session** (supervisor-created; scope/baseline/policy/final approval) vs **location session** (staff-created; counts at a location). The proposal's three-tier approval (count/location/cycle) should map to **count-identity / location-session / master-session** using canonical terms.

## 🟡 GAP 16 — List virtualization & performance (AGENT_UI_UX_RULES §10)

**Missed.** Variance/session/item lists must use virtualized lists (FlashList/FlatList/SectionList), memoized rows, stable callbacks, and **no derived calculation inside row render**. Important for the variance center and session lists; not mentioned in the proposal.

## 🟢 GAP 17 — Severity model P0–P3 (AGENT_UI_UX_RULES §14)

**Not referenced.** Findings and the roadmap should classify work using the repo's own P0–P3 severity model (§14) rather than only the proposal's P0A–P3 phases.

## 🟢 GAP 18 — Token authority nuance (AGENT_UI_UX_RULES §4.1)

**Minor.** The governance doc treats `legacyCompat.ts` as a **sanctioned migration bridge** (not just dead code) and mandates new code prefer `useUiTokens` / `ScreenContainer` / `UnifiedText` / `UnifiedView`. The proposal's "retire legacyCompat" is the end-state but should acknowledge the sanctioned-bridge phase and the preferred token APIs.

## 🟢 GAP 19 — Sync copy canon (AGENT_UI_UX_RULES §9.3)

**Minor.** The proposal's four offline states align with §9.3 but should cite the canonical good/bad copy examples (`Saved on device. 4 changes waiting to sync.` etc.) as the copy standard.

---

## Summary table

| # | Type | Finding | Severity |
| --- | --- | --- | --- |
| 1 | 🔴 Correction | Variance panel used non-canonical surface; missed movement-adjusted-expected, operational_delta, shortage/excess | Material |
| 2 | 🟠 Gap | Mandatory remark (CI-03) | High |
| 3 | 🟠 Gap | UOM precision backend-only (CI-05) | High |
| 4 | 🟠 Gap | Split count UI (CI-07) | High |
| 5 | 🟠 Gap | Negative qty rejected vs shortage valid (CI-02) | High |
| 6 | 🟠 Gap | Session states PAUSED/STALE (SI-05/06) | High |
| 7 | 🟠 Gap | Auto-approval UX (AR-02/03) | High |
| 8 | 🟠 Gap | Self-approval prevention (SI-01) | High |
| 9 | 🟠 Gap | Finalization gate vs FI-*/R9-* | High |
| 10–19 | 🟡/🟢 | Serial scope, R7 precision, physical-batch def, PENDING_SQL_VALIDATION, SQL provenance, Guidance-mode naming, master/location terms, virtualization, severity model, token bridge, sync copy | Med/Low |

---

## Recommended action

1. **Fix the variance model** in proposal §14.4 (Correction 1) — highest priority.
2. **Add the missed invariants** (Gaps 2–9) to the relevant proposal sections, each cited by its canonical code (CI-*/R*/SI-*/AR-*/FI-*).
3. **Tighten terminology** (Gaps 10–15) to canonical glossary terms.
4. Keep the proposal's strategic direction — it is correct; these are fidelity fixes to make it faithful to the canonized domain model.
