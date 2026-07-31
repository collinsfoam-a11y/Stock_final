/**
 * Baseline adapter — frozen snapshot integrity (P0F / OXS Part I).
 *
 * Maps a session/snapshot DTO to {@link BaselineIntegrityViewModel}. The
 * baseline is captured once at session start and is immutable; resuming never
 * recaptures it. The adapter only surfaces the backend's frozen-at timestamp
 * and source — it never decides immutability (that is a backend invariant).
 */

import type { BaselineIntegrityViewModel } from "./types";

/** Backend DTO shape for a session baseline snapshot (loose). */
export interface BaselineDTO {
  session_id?: string;
  /** ISO timestamp the baseline was frozen. */
  baseline_captured_at?: string | null;
  snapshot_fingerprint?: string | null;
  baseline_source?: string | null;
  /** Backend flag indicating a baseline exists (immutable once true). */
  has_baseline?: boolean;
}

const readStr = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

export const toBaselineIntegrityViewModel = (dto: BaselineDTO): BaselineIntegrityViewModel => ({
  frozenAt: readStr(dto.baseline_captured_at),
  isImmutable: Boolean(dto.has_baseline ?? dto.baseline_captured_at),
  source: readStr(dto.baseline_source) ?? "ERP snapshot",
  sessionId: readStr(dto.session_id),
});
