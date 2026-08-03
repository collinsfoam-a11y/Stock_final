# Operational Experience Specification (OXS)

> **Status:** Definitive operational specification for Stock Verify. This document is a **top-level governance artifact** and sits alongside the [Business Requirements](product/requirements.md), [Workflow Invariants](product/workflow-invariants.md), and [Glossary](product/glossary.md).
>
> **Scope:** How the application *exposes warehouse operations* — not merely how it looks. It governs personas, workspaces, operational components, navigation, interaction contracts, accessibility, offline experience, backend authority, API contracts, and acceptance criteria for both human developers and AI agents.
>
> **Companion documents:**
>
> - [`plans/UI_UX_REDESIGN_PROPOSAL.md`](../../plans/UI_UX_REDESIGN_PROPOSAL.md) — design rationale & visual direction
> - [`plans/UI_UX_PROPOSAL_AUDIT.md`](../../plans/UI_UX_PROPOSAL_AUDIT.md) — fidelity fixes vs the canonized domain model
> - [`plans/UI_UX_UPGRADE_PLAN.md`](../../plans/UI_UX_UPGRADE_PLAN.md) — phased upgrade plan & benefits
> - [`AGENT_UI_UX_RULES.md`](AGENT_UI_UX_RULES.md) — repo-level UI/UX governance (this OXS extends, not replaces, it)
>
> **Authority rule (non-negotiable):** the backend is the policy and truth engine. The frontend is a faithful, actionable projection. The frontend must never reconstruct, override, or independently infer authoritative lifecycle, reconciliation, duplicate, recount, approval, or finalization decisions.

---

## Part A — Design Principles

### A.1 Operational utility first

The interface is an operational instrument for warehouse work under fatigue, time pressure, unstable connectivity, and mid-range Android constraints. Decorative aesthetics are never a valid reason to reduce task speed, readability, recoverability, accessibility, or performance. (Extends [`AGENT_UI_UX_RULES.md`](AGENT_UI_UX_RULES.md) §3.)

### A.2 Information hierarchy (importance, not just typography)

Typography is specified in [`unified/typography.ts`](../frontend/src/theme/unified/typography.ts); this OXS specifies **information importance** so every screen is naturally consistent:

| Priority | Content | Treatment |
| --- | --- | --- |
| **P1 — Primary work** | Current item, barcode, quantity, variance, primary action | Largest numeric emphasis, top of work area, high contrast |
| **P2 — Context** | Location, session, progress, operator, sync state | Persistent header/context band, medium weight |
| **P3 — Metadata** | Timestamp, ERP source, audit provenance | Compact, muted, collapsible/secondary |

A screen is well-formed only if a fatigued operator can identify P1 in <1 glance, P2 without scrolling, and P3 on demand.

### A.3 Design tokens by meaning

Meaning survives redesigns. Prefer **semantic/operational token aliases** over raw scale steps:

`PrimaryAction · Verified · Pending · Critical · Blocking · Warning · Offline · Syncing · Recount · Approval · Variance · Shortage · Excess`

These map onto the semantic tokens defined in [`AGENT_UI_UX_RULES.md`](AGENT_UI_UX_RULES.md) §4.2 (`success/warning/error/info/accent` + operational aliases `pending/offline/synced/failed/active/disabled`). Components consume meaning tokens; they never hardcode `primary.500` or `#0655A5`.

### A.4 One consistent system

Centralized tokens, shared components, one primitive per type, no feature-local visual systems, no mixing old/new on the same screen. (See [`plans/UI_UX_REDESIGN_PROPOSAL.md`](../../plans/UI_UX_REDESIGN_PROPOSAL.md) §3.)

---

## Part B — Workflow Model

### B.1 Operational personas

Organize by **users**, not screens. Every UX decision is evaluated against the persona it serves.

#### Warehouse Staff

- **Goal:** Scan and record physical inventory accurately.
- **Can:** Observe, count, record, add evidence, resume own session, finish rack.
- **Cannot:** Approve, override, finalize, choose tracking mode, modify ERP, approve own observations (SI-01).
- **Primary workspaces:** Scan · History · Notifications · Settings.

#### Supervisor

- **Goal:** Validate warehouse observations and resolve exceptions.
- **Can:** Approve, reject, request/assign recount, resolve conflicts, approve location session.
- **Cannot:** Modify ERP directly; cannot bypass finalization gates.
- **Primary workspaces:** Dashboard · Review (variances/approvals) · Recounts · Conflicts · Reports.

#### Administrator

- **Goal:** Maintain system integrity.
- **Can:** Manage users, permissions, policies, ERP connectivity, exports, monitoring, master data.
- **Primary workspaces:** Control · Users · Permissions · Security · Logs · ERP/SQL config.

#### System (non-human actor)

- **Goal:** Preserve invariants and truth.
- **Can:** Capture immutable baseline, enforce governance, auto-approve only when ALL conditions hold, project state, reconcile.
- **Cannot:** Be overridden by the frontend.

### B.2 Operational workspaces (Workspace → Tasks)

A **workspace** is a focused area that contains the tasks and components for one operational goal. Screens are instances of workspaces.

| Workspace | Contains |
| --- | --- |
| **Scan** | Camera · current item · quantity editor · identity resolver · actions · recent activity · sync status |
| **Review** | variance panel · movement panel · evidence · approval timeline · history · comments |
| **Supervisor queue** | critical · recounts · offline · conflicts · approvals |
| **Recount** | blind mask · version lineage · comparison · decision |
| **Reconciliation** | baseline · movement-adjusted · current ERP · physical · audit/operational delta · shortage/excess |
| **Finalization** | gate checklist (FI-01..FI-08) · blockers · audit |

### B.3 Workflow state machines

Every important workflow has a canonical state machine (sources: [`workflow-invariants.md`](product/workflow-invariants.md), [`session_lifecycle_service.py`](../backend/services/session_lifecycle_service.py), [`recount_service.py`](../backend/services/recount_service.py)). The UI renders the **current backend state**; it never infers transitions.

**Location session:** `Created → Assigned → Active ⇄ Paused → (STALE after 60 min no heartbeat) → Submitted → Approved → Finalized → Archived`
> PAUSED is a real state distinct from ACTIVE (SI-05); STALE after 60 min (SI-06); ownership changes append-only (SI-07).

**Count observation:** `Draft → Validated → Queued (offline) → Synced → PENDING_SQL_VALIDATION* → Verified → Approved | Rejected`
> *PENDING_SQL_VALIDATION when SQL unavailable; physical still saved (R3.3/R3.4). Rejected → recount path.

**Recount:** `Requested → Assigned → Blind(in progress) → Completed → Compared → Resolved`
> Blind hides original physical + variance from the recounting employee (AR-04); creates a new immutable version, previous marked superseded but retained (AR-05).

**Master session / cycle:** `Configured → Active → AllLocationsSubmitted → Reconciled → FINALIZED (immutable)`

---

## Part C — Operational Components

### C.1 Domain components (reusable business summaries)

Cross-screen business components that render a view model (never raw DTOs):

`InventoryIdentity · QuantitySummary · MovementSummary · VarianceSummary · ApprovalSummary · SyncSummary · AuditSummary · BaselineIntegritySummary`

Each consumes its corresponding view model from the DTO→adapter→view-model pipeline (see Part I).

### C.2 Operational cards

Typed business cards (not a generic `ModernCard`):

`ScanCard · VarianceCard · BatchCard · SerialCard · ApprovalCard · ProjectionCard · SyncCard · ConflictCard · AuditCard · RecountCard · FinalizationGateCard`

### C.3 Business inputs (replace generic inputs)

So every screen behaves identically:

`QuantityInput · BarcodeInput · SerialInput · BatchSelector · MRPSelector · RemarkInput (mandatory — CI-03) · ReasonSelector · DamageCapture`

- `QuantityInput`: enforces no negative entry (CI-02), displays UOM precision (backend enforces — CI-05), tabular numerals.
- `BarcodeInput`: camera + manual fallback, distinct valid/duplicate/invalid/failed states (§E).
- Serialized items: `SerialInput` only; manual qty hidden (CI-06).

### C.4 Operational component library

The design library is organized by **warehouse workflows**, not generic widgets. AI agents assemble workflows from:

`ScanWorkspace · QuantityEditor · IdentityResolver · VariancePanel · MovementPanel · ApprovalTimeline · AuditTimeline · ConflictResolver · ProjectionBanner · SyncQueue · RecountPanel · FinalizationGate`

### C.5 Screen template (canonical layout)

Every operational screen follows:

```
Header (role · back/exit)
  → Context band (location · session · progress · operator · sync status)   [P2]
    → Primary work area (P1: item/qty/variance/primary action)
      → Secondary information (evidence · history · comments)               [P3]
        → Sticky actions (one primary CTA + overflow)
          → System status (offline/sync/projection banners)
```

This **is** the glossary's "Guidance mode" (one decision per screen, fixed context header, primary action).

---

## Part D — Navigation

- **Role-segmented routing** (`app/staff`, `app/supervisor`, `app/admin`) with per-role guards (already in place).
- **Consistent per-role tab bars** (3–4 destinations) for muscle-memory transfer.
- **OperationalShell** wraps every operational screen and enforces the context band + one primary CTA + back path (§C.5).
- **Back navigation preserves operational context**; interrupted workflows resume at the last meaningful step (governance §3.3, §6.6).
- **Web vs native:** share hooks/logic; keep `.web`/`.native` splits only for true platform rendering; single version constant.

---

## Part E — Interaction Contracts

Every interactive component specifies the full lifecycle so behavior is identical everywhere:

```
Input → Validation → Loading → Success → Failure → Offline → Retry
```

| State | Requirement |
| --- | --- |
| Input | Correct keyboard, preserved on failure, required/optional clear |
| Validation | Adjacent to field; preserves entered values; backend-authoritative where applicable |
| Loading | Skeleton (no layout shift); never blocks routine background sync with a modal |
| Success | Immediate, unambiguous acknowledgment (visual + haptic/audio) |
| Failure | Specific, recoverable; routes via `ExceptionRouter` with stable codes (never message parsing) |
| Offline | Saved-local/pending state visible; never looks like completed sync |
| Retry | Idempotent from the user's perspective |

### E.1 Response-time budgets (measurable acceptance criteria)

Warehouse UX depends on latency. Targets (extend governance §8.2):

| Action | Target |
| --- | --- |
| Scan feedback (visual) | < 100 ms (governance §6.1); haptic within frame |
| Quantity update | < 50 ms |
| Local save | < 100 ms |
| Sync indicator update | < 500 ms |
| Navigation | < 200 ms |
| Camera start | < 700 ms |
| Dashboard refresh | < 1 s |
| List row render | no derived calc in row; virtualized (FlashList) |

---

## Part F — Accessibility

(Extends [`AGENT_UI_UX_RULES.md`](AGENT_UI_UX_RULES.md) §7.) Mandatory:

- Contrast ≥ 4.5:1 (normal text), ≥ 3:1 (large/non-text).
- Touch targets ≥ 44×44 (48 preferred on Android); ≥ 8dp adjacent spacing.
- Every interactive element has a meaningful accessible label; icon-only controls labeled (`Scan barcode`, `Retry sync`).
- Focus order matches workflow order; status badges announce status + context.
- Text scaling without truncating operationally critical values; safe areas respected; reduced motion supported.
- **Never rely on color alone** — every status has a non-color cue (label/icon/shape).

---

## Part G — Offline Experience

(Extends governance §9.) First-class, never silent:

- Always visible: online/offline · reconnecting · pending sync count · failed sync count · last successful sync · retry action · local save state · conflict state.
- Four precise states: **recorded locally · queued · synchronized · accepted by server.** Offline records never self-approve or self-finalize (DI-04).
- Canonical copy (governance §9.3): `Saved on device. 4 changes waiting to sync.` / `Sync failed for 2 items. Retry now.`
- Offline commands: stable `command_id` + content hash; idempotent; business write + acknowledgement in one transaction (OC-01..OC-05).

---

## Part H — Backend Authority

The frontend's only responsibilities:

```
Fetch authoritative state → Render faithfully → Collect permitted input → Submit intent → Display backend decision
```

Authoritative (server-only) decisions: blind recount, distinct-user requirement, finalization eligibility, duplicate existence, baseline validity, session mutability, variance approval, auto-approval, reconciliation values. The frontend **consumes** these (e.g. `canFinalize = assessment.allowed`), never recomputes them. An ESLint authority-boundary guard makes frontend reimplementation a lint error.

---

## Part I — API Contracts

Every operational surface declares: authoritative endpoint · required fields · possible states · blocker/error codes · user actions · mutation endpoint · success response · retry behavior · offline behavior · audit event.

**Canonical variance source** = [`sql_variance_engine.py`](../backend/services/sql_variance_engine.py): `audit_delta` (physical − baseline), `operational_delta` (physical − movement-adjusted-expected), `movement_adjusted_expected`, `quantity_delta`, `shortage_qty`, `excess_qty`. The [`reconciliation_api.py`](../backend/api/reconciliation_api.py) `erp_drift`/`final_gap` fields are non-canonical and must not be featured.

**View models** (DTO → adapter → view model → component): `VarianceViewModel`, `RecountViewModel`, `FinalizationGateViewModel`, `InventoryIdentityViewModel`, `ApprovalViewModel`, `SyncStateViewModel`, `BaselineIntegrityViewModel`, `ExceptionViewModel`. Adapters map/format; they never recompute business truth.

**Provenance** distinguishes: baseline (frozen snapshot) · `sql_qty_at_submission` (live SQL at submission — R3.1) · cached ERP (never labelled `sql_qty` — VI-01). Missing is never coerced to zero.

---

## Part J — Acceptance Criteria & Governance

### J.1 Operational metrics (KPIs)

Beyond dashboard KPIs, the product is measured on: average scan time · average count time · rack completion time · recount rate · duplicate rate · offline duration · sync latency · approval turnaround · ERP drift frequency · projection failure rate. These are operational KPIs, not vanity metrics.

### J.2 UX governance (CI gate)

Every UI PR must satisfy (fail CI if violated):

- Uses `OperationalShell` + a view model + canonical tokens (meaning aliases) + domain/operational components + `ErrorBlock`/`ExceptionRouter` + `SyncStatus` + audit metadata.
- Supports offline, dark mode, accessibility; no hardcoded colors/arbitrary values; no decorative systems on operational screens.
- Enforced via `governance:ui:changed:strict`, `bundle:web:guard`, `knip`, the authority-boundary ESLint rule.

### J.3 Acceptance criteria (exit gate)

The redesign is not complete until all pass (extends [`UI_UX_REDESIGN_PROPOSAL.md`](../../plans/UI_UX_REDESIGN_PROPOSAL.md) §17):

1. No frontend code computes authoritative reconciliation values.
2. No frontend code determines finalization eligibility independently.
3. Blind recount screens do not receive/retain the prior count unless required by an authorized post-submission comparison.
4. Every backend blocker code maps to a defined UI state.
5. Missing quantities are never rendered as zero.
6. Every approval, recount, and finalization action is revalidated by the backend at submission.
7. Multi-location totals are not represented as duplicate item variance.
8. Resume never triggers baseline recapture.
9. Immutable recount lineage is visible after submission.
10. Offline success language distinguishes: recorded locally · queued · synchronized · accepted by server.
11. All reconciliation values expose data source and timestamp.
12. The UI is read-only when the backend declares a session finalized.
13. Variance surfaces use the canonical model (audit_delta, operational_delta, shortage/excess).
14. Submission blocked without mandatory remark (CI-03); negative entered qty rejected (CI-02).
15. Auto-approval surfaces its all-conditions checklist; never implies non-zero variance auto-approved for being small (AR-03).
16. Session states ACTIVE/PAUSED/STALE/FINALIZED visible; no self-approval (SI-01).
17. Response-time budgets (§E.1) met on target devices.
18. Every operational screen follows the screen template (§C.5) and uses meaning-based tokens (§A.3).

---

## Document family

| Document | Role |
| --- | --- |
| **Operational Experience Specification (this)** | Definitive operational spec — personas, workspaces, components, contracts, authority, acceptance |
| [Business Requirements](product/requirements.md) | R1–R9 product requirements |
| [Workflow Invariants](product/workflow-invariants.md) | Non-negotiable SI/CI/VI/OC/AR/DI/FI rules |
| [Glossary](product/glossary.md) | Canonical terminology |
| [`AGENT_UI_UX_RULES.md`](AGENT_UI_UX_RULES.md) | Repo-level UI/UX governance |
| [`UI_UX_REDESIGN_PROPOSAL.md`](../../plans/UI_UX_REDESIGN_PROPOSAL.md) | Design rationale & visual direction |
| [`UI_UX_PROPOSAL_AUDIT.md`](../../plans/UI_UX_PROPOSAL_AUDIT.md) | Fidelity fixes vs domain model |
| [`UI_UX_UPGRADE_PLAN.md`](../../plans/UI_UX_UPGRADE_PLAN.md) | Phased upgrade plan & benefits |

**This OXS is the single source of truth for how the application exposes warehouse operations.** It guides both human developers and AI agents while preserving the backend's authoritative business logic.
