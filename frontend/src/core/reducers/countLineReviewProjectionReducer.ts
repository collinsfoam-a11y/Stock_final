import { CONTROL_PLANE_PROJECTION_VERSION } from "@/core/config/controlPlaneFlags";
import type { CountLineReviewEvent } from "@/core/events/countLineReviewEvents";

export type ProjectedCountLineReviewSnapshot = {
  lineId: string;
  sessionId: string | null;
  status: string | null;
  approvalStatus: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  assignedTo: string | null;
  verified: boolean | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  blindRecountRequired: boolean;
  dualVerificationRequired: boolean;
  originalCountHidden: boolean;
  updatedAt: string;
  syncStatus: string;
  projectionVersion: string;
};

const buildEmptySnapshot = (event: CountLineReviewEvent): ProjectedCountLineReviewSnapshot => ({
  lineId: event.aggregateId,
  sessionId:
    "session_id" in event.payload && typeof event.payload.session_id === "string"
      ? event.payload.session_id
      : null,
  status: null,
  approvalStatus: null,
  approvedBy: null,
  approvedAt: null,
  approvalNote: null,
  rejectedBy: null,
  rejectedAt: null,
  rejectionReason: null,
  assignedTo: null,
  verified: null,
  verifiedBy: null,
  verifiedAt: null,
  blindRecountRequired: false,
  dualVerificationRequired: false,
  originalCountHidden: false,
  updatedAt: new Date(event.ts).toISOString(),
  syncStatus: "pending",
  projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
});

export const applyCountLineReviewEventToSnapshot = (
  event: CountLineReviewEvent,
  previous?: ProjectedCountLineReviewSnapshot | null
): ProjectedCountLineReviewSnapshot => {
  const base = previous || buildEmptySnapshot(event);

  if (event.type === "COUNT_LINE_APPROVED") {
    return {
      ...base,
      sessionId: event.payload.session_id ?? base.sessionId,
      status: "approved",
      approvalStatus: "APPROVED",
      approvedBy: event.payload.approved_by,
      approvedAt: event.payload.approved_at,
      approvalNote: event.payload.notes ?? null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      assignedTo: null,
      updatedAt: event.payload.approved_at,
      syncStatus: event.payload.sync_status,
      projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
    };
  }

  if (event.type === "COUNT_LINE_REJECTED") {
    return {
      ...base,
      sessionId: event.payload.session_id ?? base.sessionId,
      status: "rejected",
      approvalStatus: "REJECTED",
      rejectedBy: event.payload.rejected_by,
      rejectedAt: event.payload.rejected_at,
      rejectionReason: event.payload.notes ?? "Supervisor requested recount",
      assignedTo: event.payload.assign_to ?? base.assignedTo,
      verified: false,
      verifiedBy: null,
      verifiedAt: null,
      blindRecountRequired: true,
      dualVerificationRequired: true,
      originalCountHidden: true,
      updatedAt: event.payload.rejected_at,
      syncStatus: event.payload.sync_status,
      projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
    };
  }

  if (event.type === "STOCK_VERIFIED") {
    return {
      ...base,
      sessionId: event.payload.session_id ?? base.sessionId,
      verified: true,
      verifiedBy: event.payload.verified_by,
      verifiedAt: event.payload.verified_at,
      updatedAt: event.payload.verified_at,
      syncStatus: event.payload.sync_status,
      projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
    };
  }

  return {
    ...base,
    sessionId: event.payload.session_id ?? base.sessionId,
    verified: false,
    verifiedBy: null,
    verifiedAt: null,
    updatedAt: event.payload.unverified_at,
    syncStatus: event.payload.sync_status,
    projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
  };
};
