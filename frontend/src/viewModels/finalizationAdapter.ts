/**
 * Finalization adapter — DTO → FinalizationGateViewModel
 *
 * AUTHORITY BOUNDARY: `allowed` is read from the backend assessment and NEVER
 * computed. The frontend must not derive eligibility from pending/variance/sync
 * counts. Blockers are mapped from the backend's structured list (FI-01..FI-08 /
 * R9.1..R9.9).
 */

import type { FinalizationBlocker, FinalizationGateViewModel } from "./types";

export type FinalizationAssessmentDTO = {
  allowed?: boolean;
  can_finalize?: boolean;
  ready?: boolean;
  blockers?: Record<string, any>[];
  blocking_reasons?: (Record<string, any> | string)[];
  assessment_id?: string;
  assessmentToken?: string;
  assessed_at?: string;
  assessedAt?: string;
};

function readBlocker(raw: any): FinalizationBlocker | null {
  if (typeof raw === "string") {
    return {
      code: "UNKNOWN",
      severity: "blocking",
      description: raw,
    };
  }
  const code = (raw.code ?? raw.reason ?? "UNKNOWN").toString();
  const description = (raw.description ?? raw.message ?? raw.reason ?? code).toString();
  return {
    code,
    canonicalCode: raw.canonical_code != null ? String(raw.canonical_code) : undefined,
    entityId:
      raw.entity_id != null
        ? String(raw.entity_id)
        : raw.entityId != null
          ? String(raw.entityId)
          : undefined,
    severity: "blocking",
    action: raw.action != null ? String(raw.action) : undefined,
    description,
  };
}

export function toFinalizationGateViewModel(
  dto: FinalizationAssessmentDTO
): FinalizationGateViewModel {
  // `allowed` is backend-authoritative. Default to false (safe) only when absent.
  const allowed = dto.allowed ?? dto.can_finalize ?? dto.ready ?? false;

  const rawBlockers = [...(dto.blockers ?? []), ...(dto.blocking_reasons ?? [])];

  const blockers: FinalizationBlocker[] = rawBlockers
    .map(readBlocker)
    .filter((b): b is FinalizationBlocker => b !== null);

  return {
    allowed: Boolean(allowed),
    blockers,
    assessmentToken: dto.assessmentToken ?? dto.assessment_id,
    assessedAt: dto.assessedAt ?? dto.assessed_at,
  };
}
