/**
 * Recount adapter — DTO → RecountViewModel
 *
 * AUTHORITY BOUNDARY: lineage, status, and the distinct-user decision are read
 * from the backend. The adapter never decides whether a recount is blind, nor
 * whether the current user may perform it — the backend rejects with 403
 * (recount_api.py). The adapter only surfaces the decision so the UI can warn
 * before submit rather than after.
 *
 * BLIND INTEGRITY (OXS Part D / proposal §14.6): when the viewer is the person
 * performing a blind recount, the blind-sensitive fields are STRIPPED HERE, at
 * the boundary, so the prior count never reaches component props, React
 * DevTools, or a serialized log. Filtering at render time is not sufficient:
 * the value would still be retained in inspectable client state.
 *
 * Withheld together as one set (see RecountComparisonViewModel):
 *   originalCount, originalVariance, difference
 * `difference` is not optional cosmetics — `originalCount === recountCount −
 * difference`, so releasing it releases the original.
 */

import type {
  OptionalNumber,
  RecountComparisonViewModel,
  RecountVersionNode,
  RecountViewModel,
} from "./types";

export type RecountDTO = Record<string, unknown>;

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Read a numeric field; returns null if absent/invalid (never coerced to 0). */
function readNum(dto: RecountDTO, ...keys: string[]): OptionalNumber {
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

function readStr(dto: RecountDTO, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const raw = dto[k];
    if (typeof raw === "string" && raw.trim() !== "") return raw;
  }
  return undefined;
}

function readBool(dto: RecountDTO, ...keys: string[]): boolean {
  for (const k of keys) {
    if (typeof dto[k] === "boolean") return dto[k] as boolean;
  }
  return false;
}

/** Map the backend version chain (recount_of_id / previous_version_id lineage). */
function toLineage(raw: unknown): RecountVersionNode[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n): n is Record<string, unknown> => typeof n === "object" && n !== null)
    .map((n, i) => ({
      version: isFiniteNumber(n.version) ? n.version : i + 1,
      countedBy: readStr(n, "counted_by", "countedBy", "created_by") ?? "unknown",
      countedAt: readStr(n, "counted_at", "countedAt", "created_at"),
      isRecount: readBool(n, "is_recount", "isRecount") || n.recount_of_id != null,
      isBlind: readBool(n, "blind_recount_required", "is_blind", "isBlind") || undefined,
    }));
}

export interface RecountAdapterOptions {
  /**
   * True when the viewer is the counter performing the blind recount, i.e. the
   * person who must not see the prior value. Blind-sensitive fields are dropped
   * before the view model is constructed.
   *
   * This is a DISPLAY-SCOPE decision (who is looking), not an authorization
   * decision. Authorization stays with the backend 403.
   */
  viewerIsBlindCounter?: boolean;
}

/**
 * Build the comparison view model, withholding blind-sensitive fields when the
 * viewer must not see the original count.
 */
function toComparison(
  raw: Record<string, unknown>,
  withhold: boolean
): RecountComparisonViewModel {
  const base: RecountComparisonViewModel = {
    blinded: withhold,
    recountCount: readNum(raw, "recount_count", "recountCount", "recount_qty"),
    sqlAtRecount: readNum(raw, "sql_at_recount", "sqlAtRecount", "sql_qty_at_recount"),
    recountVariance: readNum(raw, "recount_variance", "recountVariance"),
  };

  if (withhold) {
    // Deliberately do not attach originalCount / originalVariance / difference.
    return base;
  }

  return {
    ...base,
    originalCount: readNum(raw, "original_count", "originalCount", "original_qty"),
    originalVariance: readNum(raw, "original_variance", "originalVariance"),
    difference: readNum(raw, "difference", "delta"),
  };
}

export function toRecountViewModel(
  dto: RecountDTO,
  options: RecountAdapterOptions = {}
): RecountViewModel {
  const isBlind = readBool(dto, "blind_recount_required", "is_blind", "isBlind");

  // Backend-supplied when available; the UI only warns, the backend enforces.
  const currentUserIsOriginalCounter = readBool(
    dto,
    "current_user_is_original_counter",
    "currentUserIsOriginalCounter"
  );

  // Withhold only for a blind recount being performed by the assignee. A
  // supervisor reviewing after submission is an authorized comparison view.
  const withhold = Boolean(isBlind && options.viewerIsBlindCounter);

  const rawComparison = dto.comparison ?? dto.recount_comparison ?? dto.comparison_result;
  const comparison =
    typeof rawComparison === "object" && rawComparison !== null
      ? toComparison(rawComparison as Record<string, unknown>, withhold)
      : undefined;

  return {
    requestId: readStr(dto, "request_id", "requestId", "id") ?? "",
    reason: readStr(dto, "reason", "recount_reason") ?? "",
    isBlind,
    assignedTo: readStr(dto, "assigned_to", "assignedTo"),
    status: readStr(dto, "status") ?? "unknown",
    currentUserIsOriginalCounter,
    lineage: toLineage(dto.lineage ?? dto.versions ?? dto.version_chain),
    comparison,
  };
}
