/**
 * Dashboard primitives — big-numeric KPI tiles & exception-first triage (P3).
 *
 * These components consume view models from `@/viewModels`. They never
 * recompute authoritative metrics; they only render adapter-mapped state.
 */
export { KpiTile } from "./KpiTile";
export type { KpiTileProps } from "./KpiTile";
export { ExceptionTriageList } from "./ExceptionTriageList";
export type { ExceptionTriageListProps } from "./ExceptionTriageList";
