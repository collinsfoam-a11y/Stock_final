/**
 * Exception adapter — maps backend error/blocker signals to ExceptionViewModel.
 *
 * Driven by STABLE CODES, never message-string parsing. When a backend code is
 * not recognized, it falls back to GENERIC (OXS Part E / proposal 14.5).
 */

import type { ExceptionCode, ExceptionSeverity, ExceptionViewModel } from "./types";

type ExceptionDTO = {
  code?: string;
  errorCode?: string;
  type?: string;
  message?: string;
  detail?: string;
  description?: string;
  entityId?: string;
  severity?: string;
};

/** Canonical map from backend code strings to ExceptionCode + journey. */
const CODE_MAP: Record<
  string,
  {
    code: ExceptionCode;
    severity: ExceptionSeverity;
    title: string;
    description: string;
    action: ExceptionViewModel["action"];
  }
> = {
  DUPLICATE_IDENTITY_DRAFT: {
    code: "DUPLICATE_IDENTITY_DRAFT",
    severity: "warning",
    title: "Already counted (draft)",
    description: "This item is already in your working draft for this location.",
    action: { label: "Open draft", journey: "OPEN_DRAFT" },
  },
  DUPLICATE_IDENTITY_SUBMITTED: {
    code: "DUPLICATE_IDENTITY_SUBMITTED",
    severity: "blocking",
    title: "Already submitted",
    description: "This item was already submitted for this location. Use a recount to change it.",
    action: { label: "View existing count", journey: "OPEN_EXISTING_COUNT" },
  },
  SPLIT_COUNT_CONTINUATION: {
    code: "SPLIT_COUNT_CONTINUATION",
    severity: "warning",
    title: "Continue as split count",
    description: "Same item in this location can only continue as a split count.",
    action: { label: "Continue split count", journey: "DISMISS" },
  },
  ADD_QUANTITY_REQUIRED: {
    code: "ADD_QUANTITY_REQUIRED",
    severity: "warning",
    title: "Add quantity",
    description: "Same batch here requires an explicit add-quantity command.",
    action: { label: "Add quantity", journey: "DISMISS" },
  },
  LOCATION_MISMATCH: {
    code: "LOCATION_MISMATCH",
    severity: "info",
    title: "Different location",
    description: "This item was counted elsewhere. Counting here records a relocation.",
    action: { label: "Record relocation", journey: "RELOCATION" },
  },
  MULTI_BATCH: {
    code: "MULTI_BATCH",
    severity: "warning",
    title: "Multiple batches",
    description: "Select the observed batch for this item.",
    action: { label: "Choose batch", journey: "BATCH_PICKER" },
  },
  MULTI_MRP: {
    code: "MULTI_MRP",
    severity: "warning",
    title: "Multiple MRP groups",
    description: "Select the MRP group; each MRP is a separate inventory identity.",
    action: { label: "Choose MRP", journey: "MRP_PICKER" },
  },
  MISSING_MRP: {
    code: "MISSING_MRP",
    severity: "warning",
    title: "Missing MRP",
    description: "Capture the observed MRP and a label photo.",
    action: { label: "Capture MRP", journey: "CAPTURE_MRP" },
  },
  UNKNOWN_BARCODE: {
    code: "UNKNOWN_BARCODE",
    severity: "warning",
    title: "Unknown item",
    description: "Barcode not recognized. Create an unknown-item observation.",
    action: { label: "Report unknown item", journey: "UNKNOWN_ITEM" },
  },
  SERIAL_CONFLICT: {
    code: "SERIAL_CONFLICT",
    severity: "blocking",
    title: "Duplicate serial",
    description: "Serial already counted for this item in this cycle. Cannot merge.",
    action: { label: "View serial record", journey: "SHOW_SERIAL" },
  },
  MISSING_BASELINE: {
    code: "MISSING_BASELINE",
    severity: "blocking",
    title: "Baseline missing",
    description: "No immutable baseline for this session. Counting is blocked.",
    action: { label: "Escalate", journey: "ESCALATE" },
  },
  PROJECTION_MISSING: {
    code: "PROJECTION_MISSING",
    severity: "warning",
    title: "Projection missing",
    description: "Projection gap detected. Counted value is saved pending reconciliation.",
    action: { label: "Dismiss", journey: "DISMISS" },
  },
  PENDING_SQL_VALIDATION: {
    code: "PENDING_SQL_VALIDATION",
    severity: "info",
    title: "Awaiting SQL validation",
    description: "Physical count saved; ERP validation pending.",
    action: { label: "Dismiss", journey: "DISMISS" },
  },
  SESSION_FINALIZED: {
    code: "SESSION_FINALIZED",
    severity: "blocking",
    title: "Session finalized",
    description: "This session is immutable and read-only.",
    action: { label: "View audit trail", journey: "READ_ONLY" },
  },
  RECOUNT_USER_CONFLICT: {
    code: "RECOUNT_USER_CONFLICT",
    severity: "blocking",
    title: "Recount user conflict",
    description: "Blind recount requires a different staff member than the original count.",
    action: { label: "Reassign", journey: "REASSIGN" },
  },
  SYNC_CONFLICT: {
    code: "SYNC_CONFLICT",
    severity: "warning",
    title: "Sync conflict",
    description: "Local and server versions differ. Compare before resolving.",
    action: { label: "Compare versions", journey: "COMPARE_SYNC" },
  },
};

const GENERIC = {
  code: "GENERIC" as ExceptionCode,
  severity: "warning" as ExceptionSeverity,
  title: "Something needs attention",
  description: "An issue occurred. Please retry or contact a supervisor.",
  action: { label: "Dismiss", journey: "DISMISS" as const },
};

export function toExceptionViewModel(dto: ExceptionDTO): ExceptionViewModel {
  const rawCode = (dto.code ?? dto.errorCode ?? dto.type ?? "").toString().trim().toUpperCase();
  const matched = CODE_MAP[rawCode];
  const base = matched ?? GENERIC;
  const description = dto.description ?? dto.detail ?? dto.message ?? base.description;
  return {
    code: base.code,
    severity: dto.severity === "blocking" ? "blocking" : base.severity,
    title: base.title,
    description,
    entityId: dto.entityId,
    action: base.action,
  };
}
