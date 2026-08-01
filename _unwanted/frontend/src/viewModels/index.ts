/**
 * Operational view-model layer (OXS Part I).
 *
 * DTO → adapter → view model → component. Adapters map and format; they never
 * recompute authoritative business truth. See types.ts for the authority note.
 */

export type {
  AbsenceReason,
  SourcedQuantity,
  OptionalNumber,
  VarianceViewModel,
  VarianceClassification,
  VarianceSeverity,
  ExceptionViewModel,
  ExceptionCode,
  ExceptionSeverity,
  FinalizationGateViewModel,
  FinalizationBlocker,
  RecountViewModel,
  RecountVersionNode,
  RecountComparisonViewModel,
  LocationRef,
  InventoryIdentityViewModel,
  MultiLocationEntry,
  MultiLocationDistributionViewModel,
  BaselineIntegrityViewModel,
  StaleStateReason,
} from "./types";

export { toVarianceViewModel } from "./varianceAdapter";
export type { VarianceDTO } from "./varianceAdapter";

export { toExceptionViewModel } from "./exceptionAdapter";

export { toFinalizationGateViewModel } from "./finalizationAdapter";

export {
  toInventoryIdentityViewModel,
  toMultiLocationDistributionViewModel,
} from "./identityAdapter";
export type { IdentityDTO, MultiLocationDTO, MultiLocationEntryDTO } from "./identityAdapter";

export { toBaselineIntegrityViewModel } from "./baselineAdapter";
export type { BaselineDTO } from "./baselineAdapter";
