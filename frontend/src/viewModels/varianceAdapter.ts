/**
 * Variance adapter — DTO → VarianceViewModel
 *
 * AUTHORITY BOUNDARY: this adapter MAPS and FORMATS only. It never computes
 * authoritative reconciliation values. audit_delta / operational_delta /
 * movement_adjusted_expected are read from the backend DTO; if absent they
 * become `null` (absence), never zero, never derived.
 *
 * Canonical backend source: backend/services/sql_variance_engine.py
 *   audit_delta           = total_physical − frozen_baseline
 *   operational_delta     = total_physical − movement_adjusted_expected
 *   movement_adjusted_expected = baseline + inbound − outbound + approved adj
 *   quantity_delta        = physical − expected
 *   shortage_qty          = max(expected − physical, 0)
 *   excess_qty            = max(physical − expected, 0)
 *
 * Note on shortage/excess: these are a PURE decomposition of an authoritative
 * quantity_delta (arithmetic on a backend-provided input, not a policy
 * decision). When the backend supplies shortage_qty/excess_qty they are used
 * verbatim; otherwise they are derived from quantity_delta for display only.
 */

import type {
  AbsenceReason,
  OptionalNumber,
  SourcedQuantity,
  VarianceClassification,
  VarianceSeverity,
  VarianceViewModel,
} from "./types";

/** Loose backend DTO shape (defensive — fields vary across endpoints). */
export type VarianceDTO = Record<string, unknown>;

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Read a numeric field from the DTO; returns null if absent/invalid. */
function readNum(dto: VarianceDTO, ...keys: string[]): OptionalNumber {
  for (const k of keys) {
    const raw = dto[k];
    if (isFiniteNumber(raw)) return raw;
    if (typeof raw === "string" && raw.trim() !== "") {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function readStr(dto: VarianceDTO, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const raw = dto[k];
    if (typeof raw === "string" && raw.trim() !== "") return raw;
  }
  return undefined;
}

/** Build a SourcedQuantity from candidate value/source/timestamp keys. */
function sourced(
  dto: VarianceDTO,
  valueKeys: string[],
  opts: {
    source?: string;
    sourceKey?: string;
    atKey?: string;
    absence?: AbsenceReason;
    isCachedErp?: boolean;
  } = {}
): SourcedQuantity {
  const value = readNum(dto, ...valueKeys);
  return {
    value,
    source: opts.source ?? readStr(dto, opts.sourceKey ?? ""),
    capturedAt: readStr(dto, opts.atKey ?? ""),
    absence: value === null ? opts.absence : undefined,
    isCachedErp: opts.isCachedErp,
  };
}

/**
 * Display-only decomposition of an authoritative delta into shortage/excess.
 * Pure arithmetic on a backend-provided quantity_delta — NOT a policy decision.
 */
function decomposeShortageExcess(quantityDelta: OptionalNumber): {
  shortage: OptionalNumber;
  excess: OptionalNumber;
} {
  if (quantityDelta === null) return { shortage: null, excess: null };
  return {
    shortage: Math.max(-quantityDelta, 0),
    excess: Math.max(quantityDelta, 0),
  };
}

function classify(
  operationalDelta: OptionalNumber,
  auditDelta: OptionalNumber,
  movementAdjusted: OptionalNumber,
  baseline: OptionalNumber
): VarianceClassification {
  // Relocation/multi-location is best determined by the backend; absent that,
  // infer only from authoritative deltas for display.
  if (operationalDelta !== null && Math.abs(operationalDelta) < 1e-9) {
    // Counting matches movement-adjusted expectation: any remaining gap is ERP movement.
    if (auditDelta !== null && Math.abs(auditDelta) > 1e-9) return "ERP_MOVEMENT";
    return "MATCH";
  }
  if (operationalDelta !== null) return "REAL_VARIANCE";
  // Fall back to audit delta if operational unavailable.
  if (auditDelta !== null && movementAdjusted !== null && baseline !== null) {
    if (Math.abs(movementAdjusted - baseline) > 1e-9 && Math.abs(auditDelta) > 1e-9) {
      return "ERP_MOVEMENT";
    }
  }
  if (auditDelta !== null && Math.abs(auditDelta) < 1e-9) return "MATCH";
  return "REAL_VARIANCE";
}

/**
 * Display-only severity heuristic on an AUTHORITATIVE delta.
 * NOTE: policy thresholds (e.g. auto-approval) remain backend-authoritative
 * (AR-03). This only drives presentation color, not decisions. Prefer a
 * backend-supplied severity when available.
 */
const DISPLAY_CRITICAL_THRESHOLD = 3;

function severityFor(delta: OptionalNumber): VarianceSeverity {
  if (delta === null) return "none";
  const abs = Math.abs(delta);
  if (abs < 1e-9) return "none";
  if (abs >= DISPLAY_CRITICAL_THRESHOLD) return "critical";
  return "warning";
}

function explain(vm: {
  classification: VarianceClassification;
  operationalDelta: OptionalNumber;
  auditDelta: OptionalNumber;
}): string {
  switch (vm.classification) {
    case "MATCH":
      return "Physical count matches expectation.";
    case "ERP_MOVEMENT":
      return "Gap explained by ERP movement since baseline (operational delta is clean).";
    case "REAL_VARIANCE":
      return vm.operationalDelta !== null
        ? `Real counting variance (operational delta ${vm.operationalDelta}).`
        : "Real counting variance.";
    case "RELOCATION":
      return "Difference is a location relocation, not a stock variance.";
  }
}

/**
 * Adapt a backend variance/count-line DTO into a VarianceViewModel.
 *
 * Accepts both the canonical sql_variance_engine fields AND the legacy
 * VarianceItem shape ({ system_qty, verified_qty, variance }) for migration.
 * Legacy single `variance` is mapped to quantityDelta for display continuity,
 * but canonical fields always take precedence.
 */
export function toVarianceViewModel(dto: VarianceDTO): VarianceViewModel {
  // Reference quantities
  const baseline = sourced(dto, ["erp_qty", "baseline_qty", "system_qty", "expected_qty"], {
    source: "Baseline",
    sourceKey: "baseline_source",
    atKey: "baseline_at",
    absence: "unavailable",
  });

  const movementAdjusted = sourced(dto, ["movement_adjusted_expected", "movement_adjusted"], {
    source: "Movement-adjusted expected",
    absence: "not_applicable",
  });

  // Current ERP: prefer live sql_qty_at_submission; mark cached ERP distinctly (VI-01).
  // When only cached ERP is available, live SQL is pending validation (R3.3) —
  // the cached value is present but the authoritative live figure is absent.
  const sqlAtSubmission = readNum(dto, "sql_qty_at_submission", "current_sql_qty", "sql_qty");
  const cachedErpValue = readNum(dto, "cached_erp_qty");
  const currentErp: SourcedQuantity =
    sqlAtSubmission !== null
      ? {
          value: sqlAtSubmission,
          source: readStr(dto, "sql_source") ?? "SQL verification",
          capturedAt: readStr(dto, "sql_at"),
          isCachedErp: false,
        }
      : cachedErpValue !== null
        ? {
            value: cachedErpValue,
            source: "Cached ERP",
            isCachedErp: true,
            absence: "pending_sql_validation",
          }
        : {
            value: null,
            source: "SQL verification",
            isCachedErp: false,
            absence: "unavailable",
          };

  const physical = sourced(dto, ["counted_qty", "verified_qty", "physical_qty"], {
    source: "Physical",
    sourceKey: "counted_by",
    atKey: "counted_at",
    absence: "unavailable",
  });

  // Canonical deltas — READ ONLY, never computed.
  const auditDelta = readNum(dto, "audit_delta");
  const operationalDelta = readNum(dto, "operational_delta");
  // quantity_delta: prefer backend field; fall back to legacy single `variance`.
  const quantityDelta = readNum(dto, "quantity_delta", "variance");

  // shortage/excess: prefer backend; else pure decomposition of authoritative delta.
  const backendShortage = readNum(dto, "shortage_qty", "shortage");
  const backendExcess = readNum(dto, "excess_qty", "excess");
  const decomposed = decomposeShortageExcess(quantityDelta);
  const shortageQty = backendShortage ?? decomposed.shortage;
  const excessQty = backendExcess ?? decomposed.excess;

  const classification = classify(
    operationalDelta,
    auditDelta,
    movementAdjusted.value,
    baseline.value
  );

  const vm: VarianceViewModel = {
    itemCode: readStr(dto, "item_code", "itemCode") ?? "",
    itemName: readStr(dto, "item_name", "itemName") ?? "",
    baseline,
    movementAdjustedExpected: movementAdjusted,
    currentErp,
    physical,
    quantityDelta,
    auditDelta,
    operationalDelta,
    shortageQty,
    excessQty,
    classification,
    severity: severityFor(operationalDelta ?? auditDelta),
    explanation: "",
    location: {
      floor: readStr(dto, "floor"),
      rack: readStr(dto, "rack"),
      warehouse: readStr(dto, "warehouse"),
    },
    sessionId: readStr(dto, "session_id", "sessionId"),
    countLineId: readStr(dto, "count_line_id", "id"),
  };
  vm.explanation = explain(vm);
  return vm;
}
