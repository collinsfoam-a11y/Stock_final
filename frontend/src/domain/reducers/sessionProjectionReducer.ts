import { CONTROL_PLANE_PROJECTION_VERSION } from "@/core/config/controlPlaneFlags";
import type { SessionEvent } from "@/domain/events/sessionEvents";

export type ProjectedSessionSnapshot = {
  localSessionId: string;
  serverSessionId: string | null;
  warehouse: string;
  locationType: string | null;
  locationName: string | null;
  rackNo: string | null;
  locationKey: string;
  status: string;
  type: string;
  staffUser: string;
  staffName: string;
  startedAt: string;
  closedAt: string | null;
  reconciledAt: string | null;
  completedAt: string | null;
  finalizedAt: string | null;
  finalizationStatus: string | null;
  notes: string | null;
  lastHeartbeat: string | null;
  updatedAt: string;
  syncStatus: string;
  projectionVersion: string;
};

const normalizeSegment = (value?: string | null, fallback = "UNSCOPED") =>
  value?.trim().toUpperCase() || fallback;

export const buildSessionLocationKey = (input: {
  warehouse?: string | null;
  locationType?: string | null;
  locationName?: string | null;
  rackNo?: string | null;
}): string =>
  [
    normalizeSegment(input.warehouse, "WAREHOUSE"),
    normalizeSegment(input.locationType, "WAREHOUSE"),
    normalizeSegment(input.locationName),
    normalizeSegment(input.rackNo, "NO_RACK"),
  ].join("::");

export const isProjectedSessionActive = (snapshot: {
  status?: string | null;
  finalizationStatus?: string | null;
}): boolean => {
  const status = String(snapshot.status || "").toUpperCase();
  const finalizationStatus = String(snapshot.finalizationStatus || "").toUpperCase();
  if (finalizationStatus === "FINALIZED") {
    return false;
  }
  return !["CLOSED", "COMPLETED", "CANCELLED", "ARCHIVED", "EXPORTED"].includes(status);
};

export const applySessionEventToSnapshot = (
  event: SessionEvent,
  previous?: ProjectedSessionSnapshot | null
): ProjectedSessionSnapshot => {
  if (event.type === "SESSION_STARTED") {
    return {
      localSessionId: event.payload.local_session_id,
      serverSessionId: previous?.serverSessionId ?? null,
      warehouse: event.payload.warehouse,
      locationType: event.payload.location_type ?? null,
      locationName: event.payload.location_name ?? null,
      rackNo: event.payload.rack_no ?? null,
      locationKey: buildSessionLocationKey({
        warehouse: event.payload.warehouse,
        locationType: event.payload.location_type ?? null,
        locationName: event.payload.location_name ?? null,
        rackNo: event.payload.rack_no ?? null,
      }),
      status: event.payload.status,
      type: event.payload.type,
      staffUser: event.payload.staff_user,
      staffName: event.payload.staff_name,
      startedAt: event.payload.started_at,
      closedAt: previous?.closedAt ?? null,
      reconciledAt: previous?.reconciledAt ?? null,
      completedAt: previous?.completedAt ?? null,
      finalizedAt: previous?.finalizedAt ?? null,
      finalizationStatus: previous?.finalizationStatus ?? null,
      notes: previous?.notes ?? null,
      lastHeartbeat: previous?.lastHeartbeat ?? null,
      updatedAt: event.payload.started_at,
      syncStatus: event.payload.sync_status,
      projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
    };
  }

  const base = previous || {
    localSessionId: event.aggregateId,
    serverSessionId: null,
    warehouse: "",
    locationType: null,
    locationName: null,
    rackNo: null,
    locationKey: buildSessionLocationKey({}),
    status: "OPEN",
    type: "STANDARD",
    staffUser: "unknown",
    staffName: "Unknown",
    startedAt: new Date(event.ts).toISOString(),
    closedAt: null,
    reconciledAt: null,
    completedAt: null,
    finalizedAt: null,
    finalizationStatus: null,
    notes: null,
    lastHeartbeat: null,
    updatedAt: new Date(event.ts).toISOString(),
    syncStatus: "pending",
    projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
  };

  if (event.type === "SESSION_STATUS_CHANGED") {
    const nextStatus = event.payload.status;
    const upper = nextStatus.toUpperCase();
    return {
      ...base,
      status: nextStatus,
      notes: event.payload.note ?? base.notes,
      updatedAt: event.payload.changed_at,
      syncStatus: event.payload.sync_status,
      reconciledAt: upper === "RECONCILE" ? event.payload.changed_at : base.reconciledAt,
      completedAt: upper === "COMPLETED" ? event.payload.changed_at : base.completedAt,
      closedAt: upper === "CLOSED" ? event.payload.changed_at : base.closedAt,
      projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
    };
  }

  if (event.type === "SESSION_RESUMED") {
    return {
      ...base,
      status: "ACTIVE",
      updatedAt: event.payload.resumed_at,
      syncStatus: event.payload.sync_status,
      projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
    };
  }

  if (event.type === "SESSION_HEARTBEAT") {
    return {
      ...base,
      lastHeartbeat: event.payload.heartbeat_at,
      updatedAt: event.payload.heartbeat_at,
      syncStatus: event.payload.sync_status,
      projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
    };
  }

  return {
    ...base,
    status: "COMPLETED",
    finalizedAt: event.payload.finalized_at,
    completedAt: event.payload.finalized_at,
    finalizationStatus: "FINALIZED",
    notes: event.payload.note ?? base.notes,
    updatedAt: event.payload.finalized_at,
    syncStatus: event.payload.sync_status,
    projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
  };
};
