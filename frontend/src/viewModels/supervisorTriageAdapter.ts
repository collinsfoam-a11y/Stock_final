/**
 * Supervisor dashboard triage adapter (P3 / OXS §6.5).
 *
 * Derives exception-first triage items from the supervisor dashboard stats.
 * Per §6.5 the dashboard is a *triage surface*: it leads with exception states
 * (high variance, stuck sessions, failed syncs, overdue recounts, rejected
 * submissions) so supervisors act on problems before browsing metrics.
 *
 * Authority boundary: this adapter only MAPS already-computed stats into
 * presentation triage rows. It never recomputes variance, risk, or sync state.
 * Items with a count of zero are omitted — an empty list renders nothing.
 */

import { toExceptionTriageItem, type ExceptionDTO } from "./dashboardAdapter";
import type { ExceptionTriageItem } from "./types";

export interface SupervisorTriageInput {
  highRiskSessions: number;
  openSessions: number;
  /** Number of unresolved sync conflicts / failed uploads (0 if unknown). */
  failedSyncCount?: number;
  /** Number of overdue recounts (0 if unknown). */
  overdueRecountCount?: number;
  /** Number of rejected submissions awaiting correction (0 if unknown). */
  rejectedSubmissionCount?: number;
}

/**
 * Builds the exception triage list from supervisor stats.
 * Returns only items with count > 0, sorted by severity (critical first)
 * by virtue of {@link ExceptionTriageList}'s internal sort.
 */
export const buildSupervisorTriage = (input: SupervisorTriageInput): ExceptionTriageItem[] => {
  const dtos: ExceptionDTO[] = [
    {
      kind: "failed_sync",
      count: input.failedSyncCount ?? 0,
      linkTo: { route: "/supervisor/sync-conflicts" },
    },
    {
      kind: "high_variance",
      count: input.highRiskSessions,
      linkTo: { route: "/supervisor/variances" },
    },
    {
      kind: "overdue_recount",
      count: input.overdueRecountCount ?? 0,
      linkTo: { route: "/supervisor/recount-request" },
    },
    {
      kind: "rejected_submission",
      count: input.rejectedSubmissionCount ?? 0,
      linkTo: { route: "/supervisor/sessions" },
    },
  ];

  return dtos.map(toExceptionTriageItem).filter((item) => item.count > 0);
};
