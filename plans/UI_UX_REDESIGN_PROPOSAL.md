# Stock Verify — UI/UX Redesign Proposal

> **Scope:** `Stock_final/frontend` — Expo (React Native 0.83 + Web) app for warehouse stock verification.
> **Goal:** A focused, enterprise-grade, mobile-first redesign that reduces scanning friction, restores visual consistency, and aligns the shipped UI with the stated product direction in [`docs/STOCK_VERIFICATION_V3_UI_UX_GUIDE.md`](../Stock_final/docs/STOCK_VERIFICATION_V3_UI_UX_GUIDE.md).
>
> This document is **product + design** recommendations. It pairs with the structural/code cleanup in [`plans/FRONTEND_ARCHITECTURE_REVIEW.md`](FRONTEND_ARCHITECTURE_REVIEW.md).

---

## 1. Current State Assessment

The app is **feature-rich and architecturally sound** (clean role-based routing, good state split, offline-first). The design system *foundation* in [`src/theme/unified/`](../Stock_final/frontend/src/theme/unified/index.ts) is genuinely good — a disciplined 4px spacing scale, a 12-step type scale, a complete semantic color palette, and accessibility-aware touch targets.

**The problem is consistency, not capability.** Three successive redesign generations (legacy → modern → unified → "enhanced") were layered on top of each other instead of replacing what came before. The result:

| Symptom | Evidence |
| --- | --- |
| Primitive sprawl | 7 buttons, 5 cards, 4 inputs, 3 headers, 4 loading variants in [`src/components/ui/`](../Stock_final/frontend/src/components/ui) |
| Token fragmentation | legacy + modern + unified tokens coexist; screens access theme via 3+ different hooks |
| Visual drift from intent | `glass`/`gradient`/`glassmorphism` button variants + `AuroraBackground`/`ParticleField`/`PatternBackground` — directly contradict the guide's "no glass-heavy surfaces, no AI gradients" rule |
| Platform divergence | Web vs native screens differ in feature lists, component libraries, and even version strings |
| Inconsistent status language | Variance/strict-mode/offline states rendered differently per screen |

**Design health grades (from architecture review):** UI components C−, Theme C−, Screen consistency D.

**Verdict:** No rip-and-replace needed. The redesign is a **consolidation + visual discipline** effort built on the existing `unified/` foundation, plus targeted UX improvements to the core scan and review flows.

---

## 2. Design Principles (Reaffirmed)

Carry these into every screen. They come from the existing guide and should become enforceable rules:

1. **Scan first.** Every core-flow tap is a tax. Optimize for the warehouse floor, not the boardroom.
2. **No silent failure.** Projection gaps, sync issues, duplicates must be *visible*, never implied.
3. **Context stays visible.** User, location, session, and sync state are always on screen.
4. **One action path.** Never offer two conflicting ways to complete the same stock task.
5. **Audit by design.** Approval, recount, damage, and override always show provenance.
6. **Calm, not flashy.** Enterprise utility — dense, readable, high-contrast, minimal decoration.

---

## 3. Foundation: Consolidate the Design System (Do This First)

Visual redesign is wasted if half the screens read from a different token set. This is the prerequisite.

### 3.1 One token source of truth

- **Keep:** [`src/theme/unified/`](../Stock_final/frontend/src/theme/unified/index.ts) (colors, spacing, radius, shadows, typography, animations).
- **Retire:** `designSystem.ts`, `designTokens.ts`, `themeTokens.ts`, `themes.ts`, `enhancedColors.ts`, `modernDesign.ts`, `legacyCompat.ts`, `operationalStyleBridge.ts`, `operationalTheme.ts`, and the `src/styles/` third surface.
- **One hook:** standardize on a single `useTheme()` (or `useUiTokens()`) — remove the mixed `useThemeContext().theme` / `themeLegacy` / direct `legacyCompat` imports.

### 3.2 One primitive per type

Collapse to the `Modern*` set as canonical and delete facades:

| Type | Canonical | Delete |
| --- | --- | --- |
| Button | `ModernButton` | `AppButton`, `EnhancedButton`, `RippleButton`, `AnimatedPressable`, `MyPressable` |
| Card | `ModernCard` | `AppCard`, `GlassCard`, `AnimatedCard`, `SwipeCard` |
| Input | `ModernInput` | `AppInput`, `AnimatedInput`, `EnhancedInput` |
| Header | `ScreenHeader` | `ModernHeader`, `PremiumHeader` |
| Loading | `Skeleton` / `LoadingSpinner` | `SkeletonList`, `Shimmer`, `LoadingSkeleton` |

**Critically: remove the `glass`, `gradient`, and `glassmorphism` button variants** and the decorative backgrounds (`AuroraBackground`, `ParticleField`, `PatternBackground`). They violate the stated enterprise direction and add bundle weight. Replace with flat, high-contrast surfaces.

### 3.3 Enforce it

The governance scaffolding already exists — promote it from optional to blocking:

- `governance:ui:strict` and `bundle:web:guard` into CI (today CI runs only lint + typecheck + test).
- An ESLint "no legacy token import" rule once `legacyCompat` is deprecated.

---

## 4. Visual Language Refinement

### 4.1 Color — disciplined semantic mapping

The palette is solid (corporate blue `#0655A5`, full success/warning/error/info ramps, slate neutrals). The fix is **discipline**, not new colors:

- **Status is the loudest signal.** Reserve red *exclusively* for blocking/negative states (negative stock, variance, duplicate serial, errors). Today red leaks into non-blocking decoration and dilutes its meaning.
- **Tint, don't flood.** Status chips use a `50`/`100` background with a `600`/`700` label — never a saturated `500` fill behind text (fails contrast on small text).
- **One primary action per screen.** Only the primary CTA wears solid `primary.500`. Secondary actions go `outline`; tertiary go `ghost`.
- **Dark mode parity.** Audit every semantic alias for a dark-mode counterpart. The reports folder shows light/dark screenshots per auth screen — extend that parity discipline to operational screens.

### 4.2 Typography — lean on numeric emphasis

The guide calls for *"large numeric emphasis for quantities, variance, progress, and value metrics."* Codify it:

- Quantities, counts, variance, KPI values → `fontSize["6xl"]`–`["7xl"]`, `fontWeight.bold`, tabular/mono figures for alignment.
- Item identity / section headings → `fontSize["2xl"]`–`["3xl"]`, `fontWeight.semiBold`.
- Metadata (timestamps, user, source) → `fontSize.sm`, `neutral.500`, compact.
- Consider a true **tabular-numeric** font feature for any column of numbers so digits don't jitter as values change.

### 4.3 Spacing & layout — 8pt rhythm

The 4px scale is good; enforce an **8pt visual rhythm** (use `sm`/`lg`/`2xl` as the primary beats; reserve `xs`/`xxs` for icon insets only). Consistent `layout.screenPadding` (16) and `layout.sectionGap` (24) across every screen.

### 4.4 Elevation — two levels, not five

Replace ornamental shadows with a disciplined two-tier system:

- **Level 0:** flat on background (cards in a list).
- **Level 1:** sticky elements (action bars, headers, FAB) — one soft shadow.
No drop shadows on buttons, chips, or inline elements.

### 4.5 Density modes

The app already has appearance settings (text size, theme, reduced motion). Add an explicit **density** control (compact / comfortable) that adjusts `cardPadding` and `itemGap` — valuable because supervisors reviewing long variance lists want density, while staff scanning want comfortable targets.

---

## 5. Core Flow: Scan Screen (Highest Impact)

[`app/staff/scan.tsx`](../Stock_final/frontend/app/staff/scan.tsx) is the heart of the product. This is where redesign effort pays back the most.

### 5.1 Camera-first, instant feedback

- **Default to camera viewfinder** with a persistent scan reticle; the manual-entry field is a *fallback*, not the hero.
- **Sub-200ms feedback loop:** on a good scan → green flash + success haptic + soft tone + the item panel slides in. On a duplicate/blocked scan → red flash + error haptic + a non-blocking toast that names the conflict.
- **Never lose context mid-scan.** Session, location (floor • rack), and sync pill stay pinned at the top while the camera is active.

### 5.2 The item panel — system vs counted vs variance at a glance

When an item is scanned, show a compact panel with three aligned numeric columns:

```
 SYSTEM │ COUNTED │ VARIANCE
   24   │   23    │   −1  ▼
```

- Variance column is the only colored element: green (0), amber (small), red (large/negative).
- Quantity entry uses **large stepper buttons** (±1, ±5) plus a tap-to-type numeric pad — optimized for gloved hands and one-thumb use.
- Re-scanning the same item updates *this* panel in place — never spawns a duplicate card (already a stated rule; enforce it visibly).

### 5.3 Sticky bottom action bar

- One primary CTA (`Save / Next item`) pinned with safe-area inset.
- Secondary actions (`Add damage`, `Add batch`, `Finish rack`) collapse into a single `⋯` menu unless they're the next likely action.
- The bar never scrolls away — the user's thumb always knows where "confirm" lives.

### 5.4 Strict-mode & projection gaps

When strict mode is on and a projection is missing, **don't hide it** — show an explicit inline block: `⚠ Projection missing — counted value saved, pending reconciliation`. This is a stated invariant; make it a reusable `<ProjectionGapBanner>` component.

---

## 6. Information Architecture & Navigation

### 6.1 Consistent per-role tab bars

Role-based routing is already clean (`app/admin`, `app/staff`, `app/supervisor`). Give each role a **consistent bottom tab bar** with 3–4 destinations so muscle memory transfers:

- **Staff:** Scan · History · Notifications · Settings
- **Supervisor:** Dashboard · Sessions · Variances · Settings
- **Admin:** Dashboard · Control · Users · Settings

### 6.2 Global shell contract

Every operational screen already *should* expose user/role, location/session, online/offline, sync queue, one primary CTA, and a back path. Make this a **`<OperationalShell>`** wrapper that enforces it rather than each screen hand-rolling its header. This kills the 3-header-variant problem at the root.

### 6.3 Reconcile web vs native

Today [`IndexScreen.web.tsx`](../Stock_final/frontend/src/screens/routes/IndexScreen.web.tsx) and `.native.tsx` diverge in features, libraries, and version strings. Extract shared hooks/logic; keep `.web`/`.native` splits **only** for genuinely platform-specific rendering (camera, blur). Single version constant from `package.json`.

---

## 7. Dashboards & Review Flows

### 7.1 KPI cards with large numeric emphasis

Admin/supervisor dashboards should lead with 2–4 KPI tiles using the big-numeric treatment: **Verified Value · Damage Value · Shortage Value · Projection Health**. Each tile: big number, small label, a trend arrow, and a tap-through to detail.

### 7.2 Variance center — ranked & severity-visible

[`/supervisor/variances`](../Stock_final/frontend/app/supervisor) should rank items by absolute variance value and surface **severity without opening detail** (color-coded chip + the variance number inline). Filters by severity threshold should be one tap.

### 7.3 Blind recount integrity

Recount detail must support **second-user blind verification** — the prior counted value is hidden from the second user. Make the "blind" state visually unmistakable (a lock icon + masked value) so supervisors trust the integrity of the recount.

### 7.4 Approval as a first-class surface

Approval is currently embedded in review flows. Promote a clear **approve/reject** pattern with: authenticated confirmation (supervisor PIN), mandatory reason capture on reject/escalate, and an audit log row showing who/when/what. Reuse the consistent error/action structure: `[ICON] TITLE / description / primary action`.

---

## 8. Offline UX (First-Class)

Offline is already a product principle. Tighten the *visibility*:

- **Persistent sync pill** on every write-capable screen: `● Synced 2m ago` / `◐ 3 pending` / `⚠ Retry failed`.
- **Queue depth** as a number, not just an icon.
- **Unsynced markers** on individual items/sessions (a small hollow dot) so users never mistake a local change for a server commit.
- **Parked/retry state** is explicit: `Parked — will retry` with a manual `Retry now`.
- Language discipline: never say "Saved" when it means "queued locally."

---

## 9. Interaction & Motion

- **Purposeful only.** Motion should *confirm* an action (scan success, save, approve), never decorate. Remove ambient animations (`ParticleField`, `Aurora`) from operational screens.
- **Reduced motion** is already supported via `useReducedMotion` — ensure every animation has a static fallback path (the `unified/animations.ts` tokens should gate automatically).
- **Haptics as feedback**, not noise: success (light) on good scan, warning (medium) on duplicate, error (heavy) on block. Already wired via `expo-haptics`; standardize the mapping.

---

## 10. Accessibility

- **Touch targets:** minimum 44×44 (the `touchTargets` tokens exist; the `HIT_SLOP` workaround in [`StaffHomeScreen.tsx`](../Stock_final/frontend/src/screens/staff/StaffHomeScreen.tsx) shows sub-44 icons are still slipping through — fix at the primitive level, not per-screen).
- **Contrast:** audit all `50`/`100` tint-on-text combos for WCAG AA (4.5:1 body, 3:1 large).
- **Dynamic type:** the appearance settings (text size) should scale the whole type scale, not just selected screens.
- **Screen-reader labels:** every icon-only control needs `accessibilityLabel`; decorative icons get `accessible={false}` (a `getDecorativeIconProps` util already exists — use it everywhere).
- **Focus order** on web: ensure tab order matches visual order on forms (login, register, variance filters).

---

## 11. Error & Exception UX

Standardize on the guide's structure across all error families (duplicate scans, serial conflicts, projection missing, sync conflicts, session unavailable, permission blocked, offline-not-allowed):

```
[ICON] TITLE
Description (one line, plain language)
[Primary action]
```

Build a single `<ErrorBlock variant="...">` component so every error looks and behaves identically. Replace ad-hoc `Alert.alert()` calls (e.g., the PIN prompt in `StaffHomeScreen`) with in-context, dismissible banners where possible — modal alerts interrupt scanning flow.

---

## 12. Prioritized Roadmap

| Phase | Focus | Outcome |
| --- | --- | --- |
| **0 — Foundation** | Consolidate to `unified/` tokens + one primitive per type; delete glass/gradient/decorative variants; promote governance to CI | Consistent base; smaller bundle; no more "which button?" confusion |
| **1 — Shell & Nav** | `<OperationalShell>`, per-role tab bars, reconcile web/native, single version constant | Predictable navigation; context always visible |
| **2 — Scan Flow** | Camera-first, instant feedback, system/counted/variance panel, sticky action bar, projection-gap banner | The core job gets faster and clearer |
| **3 — Review & Approval** | Ranked variance center, blind recount integrity, first-class approve/reject with audit | Supervisors trust and act on data faster |
| **4 — Dashboards** | Big-numeric KPI tiles, trend arrows, tap-through detail | Admins get signal at a glance |
| **5 — Polish** | Offline visibility, motion discipline, accessibility audit, error component unification | Calm, trustworthy, production-grade feel |

---

## 13. Quick Wins (Ship This Week)

1. **Delete the `glass`/`gradient`/`glassmorphism` button variants** and decorative backgrounds — instant visual consistency + bundle savings.
2. **Pin the scan action bar** so "confirm" never scrolls away.
3. **Standardize the sync pill** across all write-capable screens.
4. **Fix the version string** to a single constant (native shows `v2.0.0`, `v2.5`, package is `2.1.0`).
5. **Reserve red for blocking states only** — sweep non-blocking red usage.

---

## 14. Authoritative Flow Exposure

> **Audit cross-reference:** this section was verified against the repo's source-of-truth docs ([`AGENT_UI_UX_RULES.md`](../Stock_final/docs/AGENT_UI_UX_RULES.md), [`requirements.md`](../Stock_final/docs/product/requirements.md), [`workflow-invariants.md`](../Stock_final/docs/product/workflow-invariants.md), [`glossary.md`](../Stock_final/docs/product/glossary.md)) and the backend variance engine. One material correction (variance model) and several gap-fills are recorded in [`plans/UI_UX_PROPOSAL_AUDIT.md`](UI_UX_PROPOSAL_AUDIT.md).

A product design review scored the **FigJam master flow at 58/100** and flagged seven P0 "business safety" gaps. After auditing the backend, the critical reframe is:

> **The backend already implements the correct, sophisticated flow. The FigJam was the generic/incomplete artifact — not the system.** The real bottleneck is that the **frontend UI does not surface the backend's existing capability.**

Evidence (backend already correct):

| Flow-analysis P0 finding | Backend status | Evidence |
| --- | --- | --- |
| Baseline must not recapture on resume | ✅ Enforced | [`session_lifecycle_service.py:255`](../Stock_final/backend/services/session_lifecycle_service.py:255) raises `GovernanceViolation("CRITICAL: Baseline snapshot already exists and is immutable")` |
| Three-way variance (count / ERP drift / final gap) | ✅ Computed | [`reconciliation_api.py:50`](../Stock_final/backend/api/reconciliation_api.py:50) computes `count_variance`, `erp_drift`, `final_gap`; [`sync_batch_api.py:960`](../Stock_final/backend/api/sync_batch_api.py:960) populates all three |
| Immutable recount version, never reopens original | ✅ Enforced | [`recount_api.py:447`](../Stock_final/backend/api/recount_api.py:447) writes a new version with `recount_of_id` lineage; original never mutated |
| Blind recount requires distinct user | ✅ Enforced | [`recount_api.py:386`](../Stock_final/backend/api/recount_api.py:386) blocks same-user blind recount with 403 |
| Duplicate detection by inventory identity (location) | ✅ Implemented | [`count_lines_routes.py:610`](../Stock_final/backend/api/count_lines_routes.py:610) blocks duplicate "already counted in this specific location (Floor/Rack)" |
| Finalization hard gates | ✅ Implemented | [`session_lifecycle_service.py`](../Stock_final/backend/services/session_lifecycle_service.py) `_assert_session_ready_to_finalize` blocks on unknown items, pending recounts, pending approvals |
| Offline conflict preservation | ✅ Implemented | [`sync_conflicts_service.py`](../Stock_final/backend/services/sync_conflicts_service.py) preserves both observations + creates supervisor task |

**Frontend exposure (the actual gap):** a search of [`src/`](../Stock_final/frontend/src) returns **zero references** to `erp_drift`, `final_gap`, `count_variance`, `blind_recount`, or `recount_of_id`. The backend computes and enforces all of it; the UI shows a single variance number and a generic recount form.

**Therefore this is a frontend truth-exposure and operational-interaction redesign — not a redesign of the underlying stock-verification logic.** The backend is the policy and truth engine; the frontend must become a faithful, actionable projection of that engine.

### 14.1 Frontend authority boundary (non-negotiable)

> **The frontend must never reconstruct, override, or independently infer authoritative lifecycle, reconciliation, duplicate, recount, approval, or finalization decisions when the backend provides those decisions.**

The frontend's only responsibilities are:

```
Fetch authoritative state  →  Render it faithfully  →  Collect permitted input
        →  Submit intent  →  Display the backend decision
```

The frontend must **not** independently decide: whether a recount is blind, whether another user is required, whether finalization is permitted, whether a duplicate exists, whether the baseline is valid, whether a session is mutable, or whether a variance requires approval. Those are server-authoritative.

**Forbidden pattern** (recomputes policy that can drift from backend):

```ts
// ❌ NEVER — frontend inventing finalization eligibility
const canFinalize = pendingCount === 0 && varianceCount === 0 && syncQueue.length === 0;
```

**Required pattern** (consumes backend assessment):

```ts
// ✅ Backend owns the decision
const canFinalize = finalizationAssessment.allowed;
```

This single rule is the guardrail that prevents the redesign from accidentally spawning a second business-logic layer in the client.

### 14.2 View models — adapters, not raw payloads

No screen interprets raw backend objects directly. Introduce a **DTO → adapter → view model → component** pipeline so business truth is mapped and formatted once, never recomputed.

```ts
type VarianceViewModel = {
  // Reference quantities (all from backend — never recomputed)
  baselineQty: number;                 // frozen ERP snapshot (glossary: Baseline)
  movementAdjustedExpected: number;    // baseline ± external movements (glossary)
  sqlQtyAtSubmission: number | null;   // live SQL at submission (R3.1); null if unavailable
  physicalQty: number;
  // Canonical deltas (glossary + sql_variance_engine — never recomputed)
  quantityDelta: number;     // physical − expected (R4.1)
  shortageQty: number;       // max(expected − physical, 0) (R4.2)
  excessQty: number;         // max(physical − expected, 0) (R4.3)
  auditDelta: number;        // total_physical − frozen_baseline (glossary)
  operationalDelta: number;  // total_physical − movement_adjusted_expected (glossary)
  classification:
    | "MATCH"
    | "ERP_MOVEMENT"
    | "REAL_VARIANCE"
    | "RELOCATION";
  severity: "none" | "warning" | "critical";
  explanation: string;     // human-readable, backend-supplied where possible
};
```

Required view models: `VarianceViewModel`, `RecountViewModel`, `FinalizationGateViewModel`, `InventoryIdentityViewModel`, `ApprovalViewModel`, `SyncStateViewModel`, `BaselineIntegrityViewModel`, `ExceptionViewModel`. **Adapters map and format; they do not recompute business truth.**

### 14.3 Inventory-identity resolution

The backend resolves identity as `Location + Item + Batch + MRP + Mfg date + Expiry + Serial + Condition`. The scan screen must make this **visible and confirmable**:

- After a scan, the item panel shows resolved identity chips (batch, MRP, expiry) — not just item name + qty.
- When ambiguity exists (multiple batches / MRPs / barcode matches), present a **disambiguation sheet** rather than silently picking one. The backend already distinguishes these; the UI must ask.
- Serialized items: hide manual qty entry (backend restricts it — [`canonical_inventory.py`](../Stock_final/backend/services/canonical_inventory.py)); show a serial list and increment by accepted scans only.

### 14.4 Reconciliation presentation — the canonical variance model

> ⚠️ **Corrected.** An earlier draft featured a `count_variance` / `erp_drift` / `final_gap` panel sourced from [`reconciliation_api.py`](../Stock_final/backend/api/reconciliation_api.py). That is a **non-canonical** surface. The glossary + [`sql_variance_engine.py`](../Stock_final/backend/services/sql_variance_engine.py) canonize the model below. See [`plans/UI_UX_PROPOSAL_AUDIT.md`](UI_UX_PROPOSAL_AUDIT.md) Correction 1.

The single highest-value UI improvement. Replace the single "variance" display with the **canonical** model, using **fixed labels across every screen and report** (no per-screen renaming). The panel surfaces four reference quantities and their canonical deltas:

```
 BASELINE            MOVEMENT-ADJ EXPECTED      CURRENT ERP (SQL)        PHYSICAL
 frozen snapshot     baseline ± movements       sql_qty_at_submission    counted
 ────────────────────────────────────────────────────────────────────────────────
 AUDIT DELTA         OPERATIONAL DELTA           SHORTAGE        EXCESS
 physical − baseline physical − mv-adjusted     max(exp−phys,0) max(phys−exp,0)
```

- **Audit delta** = total physical − frozen baseline (glossary) — the raw difference vs the locked reference.
- **Operational delta** = total physical − *movement-adjusted-expected* (glossary / [`sql_variance_engine.py:34`](../Stock_final/backend/services/sql_variance_engine.py:34)) — the **true counting-accuracy signal**, because it subtracts stock that legitimately moved *during* the count. This is the figure that tells you whether staff miscounted, independent of ERP churn.
- **Movement-adjusted expected** = baseline + inbound − outbound + approved adjustments (glossary) — explains *why* the expected quantity shifted since baseline.
- **Shortage / Excess** decomposition (R4.2 / R4.3) — variance must split into `shortage_qty = max(expected − physical, 0)` and `excess_qty = max(physical − expected, 0)`, never a single signed number.

A single figure is operationally misleading: it cannot distinguish a genuine counting discrepancy (operational delta), legitimate ERP movement (movement-adjusted vs baseline), a relocation, a resolved difference, or a count that matches current ERP but differs from baseline. Color the **operational delta** by severity; show audit delta and movement-adjustment as explanatory context.

#### Provenance — every number shows its source (R3.1 / R3.2 / VI-01)

The panel must not show bare numbers. Each value exposes its data source and timestamp, and **must distinguish live SQL from cached ERP** (cached ERP must never be labelled `sql_qty` — VI-01):

```
Baseline                Session snapshot · 09:42        (frozen, locked)
Movement-adjusted       Baseline + 2 inbound − 1 outbound · policy v3
Current ERP (SQL)       sql_qty_at_submission · 11:18   (live at submission)
Physical                Noufal · Device D17 · 11:16
```

If SQL was unavailable at submission, show the observation as `PENDING_SQL_VALIDATION` (R3.3) — the physical count is still saved (R3.4) and must never be coerced to a zero gap. This makes discrepancies **explainable**, not merely calculated.

#### Absence vs. zero — never coerce missing to zero

| Backend state | Display |
| --- | --- |
| Quantity is `0` | `0` |
| Quantity unavailable | `—` |
| Projection pending | `Pending` |
| ERP unavailable | `Unavailable` |
| Stale ERP value | value + `stale` label |
| Calculation not applicable | `N/A` |

Coercing missing values to zero creates false matches and false confidence. This applies to all three-number displays.

### 14.5 Exception routing — typed journeys, stable codes

A generic toast cannot support operational recovery. Build an `<ExceptionRouter>` driven by **stable machine-readable backend codes**, never message-string parsing:

| Backend code | UI journey |
| --- | --- |
| `DUPLICATE_IDENTITY_DRAFT` | Open existing record, append |
| `DUPLICATE_IDENTITY_SUBMITTED` | Hard block + link to existing count |
| `LOCATION_MISMATCH` | Relocation/distribution workflow |
| `MULTI_BATCH` | Batch picker sheet |
| `MULTI_MRP` | MRP group selector → separate identity |
| `MISSING_MRP` | Capture observed MRP + label photo |
| `UNKNOWN_BARCODE` | Unknown-item observation flow |
| `SERIAL_CONFLICT` | Hard block/quarantine — serial uniqueness is **per item within the master session**, never global (R7.3, glossary); show conflicting record |
| `MISSING_BASELINE` | Block count, escalate |
| `PROJECTION_MISSING` | Save permitted state or block per backend response |
| `PENDING_SQL_VALIDATION` | Physical saved; show "awaiting SQL validation" (R3.3/R3.4) — never coerce to a zero gap |
| `SPLIT_COUNT_CONTINUATION` | Same item/batch twice in one location allowed **only** as split-count continuation (R7.2) |
| `ADD_QUANTITY_REQUIRED` | Same physical batch twice in one location requires explicit add-quantity command (R7.5) |
| `SESSION_FINALIZED` | Read-only view + audit trail |
| `RECOUNT_USER_CONFLICT` | Reassignment workflow |
| `SYNC_CONFLICT` | Compare local vs server versions |

This replaces catch-all error toasts with **actionable, typed journeys** — the single biggest UX win for warehouse staff. Note R7.1/R7.4: same item or same physical batch in **different** locations is allowed and aggregated (shown as distribution, §14.9), never blocked as a duplicate.

### 14.6 Recount lineage — immutable versions, true blindness

The recount UI must **not look like editing the previous count**. It must show the lineage:

```
Original count → Recount request → New immutable version → Comparison → Supervisor decision
```

For blind recounts, the assignee's screen must hide — not merely mask — the prior quantity, its variance, directional hints ("higher"/"lower"), and any progress value that indirectly reveals the earlier number. The prior value must not be retained in inspectable client state or logs. Display blind-recount status and the assigned user prominently; let the **backend** reject the operation if the user is not distinct (403).

Surfacing the backend's full model:

- **Version lineage:** count-version chain (`v1 → v2 → v3`) with who/when, from `recount_of_id` / `previous_version_id` / `recount_iteration`.
- **Comparison result:** after submit, surface `RecountComparisonResult` (original vs recount vs SQL-at-recount vs difference) — backend returns it ([`recount_service.py:138`](../Stock_final/backend/services/recount_service.py:138)); UI currently discards it.

### 14.7 Approval semantics — three distinct tiers

Count-line approval ≠ item reconciliation. The backend treats these as separate gates; the UI must label them with **consistent, distinct terminology**:

- **Count identity approved** — badge as `Count approved`, never `Reconciled`.
- **Location session approval** — distinct action with its own gate.
- **Cycle reconciliation / finalization** — behind the hard-gate checklist (14.8).

No one should mistake a line-level sign-off for warehouse truth.

### 14.8 Submission & finalization gates — backend-driven, race-safe

The backend's `_assert_session_ready_to_finalize` returns structured blockers. Turn that list into a **visible checklist** the supervisor can act on, not a single blocking error at submit time. Backend returns:

```json
{
  "allowed": false,
  "blockers": [
    { "code": "UNRESOLVED_RECOUNT", "entity_id": "line-123", "severity": "blocking", "action": "OPEN_RECOUNT" }
  ]
}
```

- **Pre-submission gate** (location session): no unresolved drafts, no missing required params (incl. mandatory remark — CI-03), no unprocessed photos, no pending offline ops, no serial inconsistencies, no unclassified damage; empty-location explicitly confirmed; coverage complete.
- **Finalization gate** (master session) — map directly to the canonical invariants **FI-01..FI-08 / R9.1..R9.9**: zero unresolved blocking states (FI-01); all location sessions submitted (R9.1/FI-02); **all commands acknowledged** (R9.2/FI-03); **no blocked sync records** (R9.3); **no pending SQL validation** (R9.5/FI-04); no unresolved duplicate conflicts (R9.4/FI-05); all required evidence uploaded (R9.6/FI-06); serial reconciliation passes (R9.7/FI-07); **projections match** (R9.8/FI-08); rack locks released only after finalization (R9.9).

Render each as a check/cross row with a tap-through to resolve. The CTA is enabled **only when the backend says `allowed`**.

### 14.9 Multi-location interpretation — distribution, not duplicate

When an item is counted in a second location, show it as an added **distribution row** under the item, classified as **relocation** (not variance). The backend already separates these; the UI must not collapse them into one confusing "variance." Multi-location totals are never represented as duplicate item variance.

### 14.10 Resume & baseline integrity

The backend forbids baseline recapture on resume, so the UI must **never imply a fresh baseline** when resuming. Show baseline status explicitly:

```
Baseline captured      2026-07-31 09:42
Captured by            Session initialization
Status                 Locked
ERP updated since baseline   Yes
```

Resume restores the **same verification context**, never a new reference quantity. There is **no normal "refresh baseline" action**. Any exceptional recapture must be restricted, explicitly governed, supervisor/admin-controlled, audited, and clearly separated from resume.

### 14.11 Offline & stale-state behavior

A UI can display correct backend logic and still submit against stale state. Every sensitive action (approve, reject, recount, finalize, resolve conflict, reassign, record relocation, correct batch identity) must carry a concurrency token (`version` / `updated_at` / `etag` / `assessment_id`) and follow:

```
Fetch authoritative assessment → Display action → User confirms
  → Submit with token → Backend revalidates → Success or structured stale-state response
```

**Never trust a button that was enabled minutes earlier.** On a stale-state response, re-fetch and render the newly returned blockers.

Offline language must distinguish four states precisely: **recorded locally · queued · synchronized · accepted by server.** Offline records never self-approve or self-finalize (DI-04). Canonical copy examples live in [`AGENT_UI_UX_RULES.md`](../Stock_final/docs/AGENT_UI_UX_RULES.md) §9.3 (e.g. `Saved on device. 4 changes waiting to sync.`).

### 14.12 Domain-invariant UI obligations

The UI must faithfully enforce (display/collect, never decide) these canonized invariants — see [`plans/UI_UX_PROPOSAL_AUDIT.md`](UI_UX_PROPOSAL_AUDIT.md) for the full gap list:

- **Mandatory remark** — every submitted item requires a remark (CI-03 / R2.3); block submit without it.
- **UOM precision is display-only** — show precision per unit, but the **backend** enforces (CI-05 / R2.5); the frontend must not reject valid precision.
- **Split count** — support structured carton/loose entry (`type`, `count`, `units_per_group`, `total`) per CI-07.
- **Negative quantity ≠ shortage** — reject negative *entered* quantities (CI-02 / R2.2); a shortage (negative delta) is valid and shown red (R4.1).
- **Zero is valid** — `0` is a legitimate physical count (CI-01 / R2.1); distinguish from *missing* (§14.4 absence-vs-zero).
- **Session state machine** — surface `ACTIVE`, `PAUSED` (distinct from ACTIVE — SI-05), `STALE` (60-min no heartbeat — SI-06), and `FINALIZED` as real, visible states.
- **Tracking mode is system-controlled** — staff never choose QUANTITY/BATCH/SERIAL/BUNDLE (CI-04 / R2.4); the policy snapshot decides; serialized items hide manual qty (CI-06).
- **Auto-approval transparency** — show the all-conditions checklist (delta=0, no mismatches, remark, evidence); a threshold must **never** auto-approve a non-zero variance merely because it is small (AR-02 / AR-03 / R6.2 / R6.3).
- **No self-approval** — staff cannot approve their own observations (SI-01 / AR-01 / R6.1); the UI must not offer it.
- **Evidence is policy-driven** — evidence requirements are determined by policy, not staff discretion (DI-03 / R8.1).

### 14.13 Terminology alignment

Use the canonical glossary terms everywhere — no per-screen renaming:

- **Master session** vs **location session** (two-tier model). The three approval tiers map to **count-identity / location-session / master-session**.
- **Guidance mode** (glossary) — "one decision per screen with fixed context header and primary action" — **is** the proposal's shell concept; adopt this name (`<OperationalShell>` ≈ Guidance-mode shell) rather than inventing new vocabulary.
- **Physical batch** = `item_code + batch number + MRP + mfg date + expiry date`; **condition allocation** (SALEABLE/DAMAGED/EXPIRED) is a separate axis.
- **Location hierarchy** = Company → Building → Floor → Rack/Area.

---

## 15. API Contract Requirements (per UI surface)

Every Section 14 surface must declare its backend contract so implementation agents cannot guess. For each: authoritative endpoint, required fields, possible states, blocker/error codes, user actions, mutation endpoint, success response, retry behavior, offline behavior, audit event.

**Finalization contract (example template):**

| Element | Requirement |
| --- | --- |
| Assessment endpoint | Returns current finalization eligibility |
| Authority | Backend only |
| Blockers | Structured list with stable codes |
| CTA | Enabled only when backend says `allowed` |
| Submission | Finalize endpoint |
| Race handling | Revalidate on submission (concurrency token) |
| Failure | Render newly returned blockers |
| Audit | Show finalizer, timestamp, resulting state |

The same template must be completed for: variance read, recount request/assign/submit, approval (3 tiers), inventory-identity resolution, exception resolution, sync-conflict compare, and baseline-integrity read. **The API contract inventory (P0A) must precede component work** — otherwise design agents will invent temporary frontend calculations that later become permanent.

---

## 16. Execution Priority

The API contract inventory precedes component work; otherwise temporary frontend calculations become permanent.

| Phase | Scope | Reason |
| --- | --- | --- |
| **P0A** | API contract inventory + frontend DTO/view-model mapping | Prevent UI from guessing domain truth |
| **P0B** | Three-way variance panel + provenance | Highest decision-value exposure |
| **P0C** | Finalization blockers + exception router | Prevents unsafe/confusing completion |
| **P0D** | Recount lineage + blind workflow | High governance & audit impact |
| **P0E** | Inventory-identity + multi-location resolution | Reduces duplicate/misclassification errors |
| **P0F** | Baseline/resume + stale-state UX | Protects temporal integrity |
| **P1** | Primitive & token consolidation; `<OperationalShell>` | Enables consistent implementation |
| **P2** | Scan workspace + navigation redesign | Improves operational speed |
| **P3** | Dashboards, polish, motion | Lower risk and dependency |

---

## 17. Acceptance Criteria

The redesign is **not complete** until all of the following pass:

1. No frontend code computes authoritative reconciliation values.
2. No frontend code determines finalization eligibility independently.
3. Blind recount screens do not receive or retain the prior count unless operationally required by an authorized post-submission comparison view.
4. Every backend blocker code maps to a defined UI state.
5. Missing quantities are never rendered as zero.
6. Every approval, recount, and finalization action is revalidated by the backend at submission time.
7. Multi-location totals are not represented as duplicate item variance.
8. Resume never triggers baseline recapture.
9. Immutable recount lineage is visible after submission.
10. Offline success language distinguishes: recorded locally · queued · synchronized · accepted by server.
11. All reconciliation values expose their data source and timestamp.
12. The UI remains read-only when the backend declares a session finalized.
13. Variance surfaces use the **canonical** model (audit_delta, operational_delta vs movement-adjusted-expected, shortage/excess) — not a single signed number, and not the non-canonical `erp_drift`/`final_gap` fields.
14. Submission is blocked without a mandatory remark (CI-03); negative entered quantities are rejected (CI-02) while shortages display validly.
15. Auto-approval surfaces its all-conditions checklist and never implies a non-zero variance was auto-approved for being small (AR-03).
16. Session states ACTIVE / PAUSED / STALE / FINALIZED are visible; staff cannot self-approve (SI-01).

---

**Bottom line:** the system's *brain* (backend) is already correct and sophisticated. This is a **frontend truth-exposure and operational-interaction redesign** — giving that brain a *face* that is faithful, legible, race-safe, and action-oriented, so the warehouse floor and supervisors can see and trust the integrity the backend already guarantees. Sections 14–17 establish the authority boundary, API contracts, stale-state handling, provenance, and formal acceptance criteria required to make the proposal execution-grade rather than merely design-complete.
