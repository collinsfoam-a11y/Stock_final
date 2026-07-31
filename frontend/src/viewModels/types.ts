/**
 * Operational View Model types
 *
 * These are the SCREEN-FACING models for the Operational Experience Specification
 * (see docs/OPERATIONAL_EXPERIENCE_SPECIFICATION.md, Part I).
 *
 * Authority boundary: view models are produced by ADAPTERS that MAP and FORMAT
 * backend DTOs. They MUST NOT recompute authoritative business truth
 * (reconciliation values, finalization eligibility, duplicate/recount/approval
 * decisions). Where the backend does not provide a value, the field is `null`
 * (absence) and the UI renders it as such — never as zero.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** A numeric value that may be genuinely absent. `0` is a valid value (CI-01). */
export type OptionalNumber = number | null;

/** Absence classification for rendering (see OXS Part I, absence-vs-zero). */
export type AbsenceReason =
  | "unavailable"
  | "pending"
  | "pending_sql_validation"
  | "stale"
  | "not_applicable";

/** A quantity with explicit provenance + absence semantics. */
export interface SourcedQuantity {
  value: OptionalNumber;
  /** Human-readable data source, e.g. "Session snapshot", "SQL verification". */
  source?: string;
  /** ISO timestamp of when the value was captured. */
  capturedAt?: string;
  /** When value is null, why. When value is present, undefined. */
  absence?: AbsenceReason;
  /** True when the value is a cached ERP figure rather than live SQL (VI-01). */
  isCachedErp?: boolean;
}

// ---------------------------------------------------------------------------
// Variance
// ---------------------------------------------------------------------------

export type VarianceClassification = "MATCH" | "ERP_MOVEMENT" | "REAL_VARIANCE" | "RELOCATION";

export type VarianceSeverity = "none" | "warning" | "critical";

/**
 * VarianceViewModel — canonical reconciliation model.
 *
 * Reference quantities and deltas come FROM THE BACKEND (sql_variance_engine).
 * The adapter never computes audit_delta / operational_delta / movement_adjusted.
 * shortage/excess may be derived from an authoritative quantity_delta as a
 * pure display decomposition (arithmetic on an authoritative input), but
 * backend-supplied shortage_qty/excess_qty are always preferred.
 */
export interface VarianceViewModel {
  itemCode: string;
  itemName: string;
  // Reference quantities (all backend-sourced)
  baseline: SourcedQuantity; // frozen ERP snapshot (glossary: Baseline)
  movementAdjustedExpected: SourcedQuantity; // baseline ± external movements
  currentErp: SourcedQuantity; // sql_qty_at_submission (live) or cached ERP
  physical: SourcedQuantity; // counted qty
  // Canonical deltas (backend-sourced; null if backend did not provide)
  quantityDelta: OptionalNumber; // physical − expected (R4.1)
  auditDelta: OptionalNumber; // physical − baseline (glossary)
  operationalDelta: OptionalNumber; // physical − movement-adjusted (glossary)
  shortageQty: OptionalNumber; // max(expected − physical, 0) (R4.2)
  excessQty: OptionalNumber; // max(physical − expected, 0) (R4.3)
  // Derived (non-authoritative) display helpers
  classification: VarianceClassification;
  severity: VarianceSeverity;
  explanation: string;
  // Location/identity context
  location?: { floor?: string; rack?: string; warehouse?: string };
  sessionId?: string;
  countLineId?: string;
}

// ---------------------------------------------------------------------------
// Exception
// ---------------------------------------------------------------------------

/**
 * Stable, machine-readable exception codes. Driven by backend codes; never by
 * message-string parsing. Maps to typed UI journeys (OXS Part E / proposal 14.5).
 */
export type ExceptionCode =
  | "DUPLICATE_IDENTITY_DRAFT"
  | "DUPLICATE_IDENTITY_SUBMITTED"
  | "SPLIT_COUNT_CONTINUATION"
  | "ADD_QUANTITY_REQUIRED"
  | "LOCATION_MISMATCH"
  | "MULTI_BATCH"
  | "MULTI_MRP"
  | "MISSING_MRP"
  | "UNKNOWN_BARCODE"
  | "SERIAL_CONFLICT"
  | "MISSING_BASELINE"
  | "PROJECTION_MISSING"
  | "PENDING_SQL_VALIDATION"
  | "SESSION_FINALIZED"
  | "RECOUNT_USER_CONFLICT"
  | "SYNC_CONFLICT"
  | "GENERIC";

export type ExceptionSeverity = "blocking" | "warning" | "info";

export interface ExceptionViewModel {
  code: ExceptionCode;
  severity: ExceptionSeverity;
  title: string;
  description: string;
  /** Entity the exception refers to (for deep-linking). */
  entityId?: string;
  /** Suggested next UI journey. */
  action?: {
    label: string;
    journey:
      | "OPEN_DRAFT"
      | "OPEN_EXISTING_COUNT"
      | "RELOCATION"
      | "BATCH_PICKER"
      | "MRP_PICKER"
      | "CAPTURE_MRP"
      | "UNKNOWN_ITEM"
      | "SHOW_SERIAL"
      | "ESCALATE"
      | "READ_ONLY"
      | "REASSIGN"
      | "COMPARE_SYNC"
      | "DISMISS";
  };
}

// ---------------------------------------------------------------------------
// Finalization gate
// ---------------------------------------------------------------------------

export interface FinalizationBlocker {
  /** Backend error/reason code (e.g. "UNRESOLVED_RECOUNT"). */
  code: string;
  /** Canonical invariant identifier on the FI-X/R9.X scheme (e.g. "FI-01", "R9.3"). */
  canonicalCode?: string;
  entityId?: string;
  severity: "blocking";
  action?: string;
  description: string;
}

/**
 * FinalizationGateViewModel — consumes the backend finalization assessment.
 * `allowed` is backend-authoritative; the frontend never computes eligibility.
 */
export interface FinalizationGateViewModel {
  allowed: boolean;
  blockers: FinalizationBlocker[];
  /** Concurrency token for race-safe submission. */
  assessmentToken?: string;
  assessedAt?: string;
}

// ---------------------------------------------------------------------------
// Recount
// ---------------------------------------------------------------------------

export interface RecountVersionNode {
  version: number;
  countedBy: string;
  countedAt?: string;
  isRecount: boolean;
  isBlind?: boolean;
}

/**
 * Original-vs-recount comparison.
 *
 * Blind integrity (OXS Part D / proposal §14.6): the prior count must not be
 * retained in inspectable client state, so when `blinded` is true the
 * blind-sensitive fields are ABSENT from this object entirely rather than
 * hidden at render time.
 *
 * `difference` is blind-sensitive because it reveals the original by
 * arithmetic: `originalCount === recountCount - difference`. `originalVariance`
 * leaks the same way against `recountVariance`. Both are withheld with
 * `originalCount`, never independently.
 */
export interface RecountComparisonViewModel {
  /** True when blind-sensitive fields have been withheld from this view model. */
  blinded: boolean;
  recountCount: OptionalNumber;
  sqlAtRecount: OptionalNumber;
  recountVariance: OptionalNumber;
  /** Withheld (absent) when `blinded`. */
  originalCount?: OptionalNumber;
  /** Withheld (absent) when `blinded` — leaks the original by arithmetic. */
  difference?: OptionalNumber;
  /** Withheld (absent) when `blinded` — leaks the original by arithmetic. */
  originalVariance?: OptionalNumber;
}

export interface RecountViewModel {
  requestId: string;
  reason: string;
  isBlind: boolean;
  assignedTo?: string;
  status: string;
  /** Whether the current user is the original counter (blind distinct-user guard). */
  currentUserIsOriginalCounter?: boolean;
  lineage: RecountVersionNode[];
  comparison?: RecountComparisonViewModel;
}

// ---------------------------------------------------------------------------
// Inventory identity & multi-location (R7 / glossary: Inventory identity)
// ---------------------------------------------------------------------------

/** A physical location reference. Floor + Rack define the countable slot. */
export interface LocationRef {
  floor?: string;
  rack?: string;
  warehouse?: string;
}

/**
 * InventoryIdentityViewModel — the identity tuple that defines "the same
 * physical stock instance" for duplicate governance (R7).
 *
 * The backend blocks a duplicate as "already counted in this specific location
 * (Floor/Rack)". The `identityKey` is the backend-defined canonical key; the
 * frontend never constructs or compares identity keys itself — it only
 * displays the backend's `alreadyCounted` verdict.
 */
export interface InventoryIdentityViewModel {
  itemCode: string;
  itemName: string;
  batchNo?: string | null;
  serialNo?: string | null;
  location: LocationRef;
  /** Backend-defined canonical identity key (display only). */
  identityKey: string;
  /** Backend verdict: this identity has already been counted here. */
  alreadyCounted: boolean;
  /** When already counted, the existing observation/count reference. */
  existingCountId?: string;
}

/**
 * A single location entry in a multi-location distribution. Each (item,
 * location) pair is a DISTINCT countable identity — not a duplicate.
 */
export interface MultiLocationEntry {
  location: LocationRef;
  identityKey: string;
  alreadyCounted: boolean;
  countedQty?: OptionalNumber;
  existingCountId?: string;
}

/**
 * MultiLocationDistributionViewModel — the same item across several locations.
 *
 * Multi-location is DISTRIBUTION, not duplication (proposal §14.9). Each
 * location is a separate countable identity. This model lets the UI present
 * "this item lives in N locations; here is the count status of each" without
 * ever treating a second location as a duplicate error.
 */
export interface MultiLocationDistributionViewModel {
  itemCode: string;
  itemName: string;
  locations: MultiLocationEntry[];
  /** Convenience: locations.length (precomputed by the adapter). */
  totalLocations: number;
}

// ---------------------------------------------------------------------------
// Baseline integrity & stale-state (R3 / glossary: Baseline; OXS Part I)
// ---------------------------------------------------------------------------

/**
 * BaselineIntegrityViewModel — the frozen baseline snapshot (P0F).
 *
 * The baseline is captured ONCE at session start and is IMMUTABLE: resuming a
 * session never recaptures it (the backend raises GovernanceViolation if
 * attempted). This model surfaces the frozen timestamp + source so the UI can
 * reassure the operator that the reference will not shift under them.
 */
export interface BaselineIntegrityViewModel {
  /** ISO timestamp when the baseline was frozen. */
  frozenAt?: string;
  /** Always true once captured — the baseline never changes. */
  isImmutable: boolean;
  /** Human-readable source, e.g. "ERP snapshot". */
  source?: string;
  sessionId?: string;
}

/**
 * Stale-state reasons surfaced to the UI (OXS Part I, stale-state tokens).
 * Each maps to a distinct operator-facing caveat.
 */
export type StaleStateReason =
  | "cached_erp" // ERP figure is cached, not live SQL (VI-01)
  | "pending_sql_validation" // awaiting SQL-at-submission validation
  | "stale_projection" // local projection may lag the server
  | "offline" // device is offline; data may be behind
  | "baseline_missing"; // no baseline captured yet
