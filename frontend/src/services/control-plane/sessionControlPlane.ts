import api from "@/services/httpClient";
import { useAuthStore } from "@/store/authStore";
import { controlPlaneFlags } from "@/core/config/controlPlaneFlags";
import { generateOfflineId, generateUUID } from "@/utils/uuid";
import type { CreateSessionParams } from "@/services/api/sessionManagementApi";
import type { Session } from "@/types/session";
import {
  createSessionFinalizedEvent,
  createSessionHeartbeatEvent,
  createSessionResumedEvent,
  createSessionStartedEvent,
  createSessionStatusChangedEvent,
  isSessionStartedEvent,
  type SessionEvent,
} from "@/domain/events/sessionEvents";
import {
  bindServerSessionId,
  buildSessionLocationKey,
  findActiveProjectedSessionForLocation,
  getPendingSessionEvents,
  getProjectedSessionById,
  getProjectedSessions,
  markSessionEventFailed,
  markSessionEventRetry,
  markSessionEventSynced,
  rebuildSessionProjections,
  recordSessionEvent,
  resolveLocalSessionId,
  resolveServerSessionId,
} from "@/data/repositories/sessionControlPlaneRepository";
import { getPendingInventoryEvents } from "@/data/repositories/inventoryControlPlaneRepository";
import { getPendingCountLineReviewEvents } from "@/data/repositories/countLineReviewControlPlaneRepository";
import {
  cacheSession,
  removeSessionFromCache,
  type CachedSession,
} from "@/services/offline/offlineStorage";
import { incrementControlPlaneMetric } from "@/services/observability/controlPlaneMetrics";
import { controlPlaneEventBus } from "@/services/control-plane/controlPlaneEventBus";
import { getNetworkStatus } from "@/utils/network";

const isServerValidationError = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return typeof status === "number" && status >= 400 && status < 500;
};

const readErrorMessage = (error: unknown, fallback: string): string =>
  (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
  (error instanceof Error ? error.message : fallback);

const isMutationSafeOnline = () => getNetworkStatus().status === "ONLINE";
const shouldAttemptSessionApi = () => getNetworkStatus().shouldAttemptApi;

export type FinalizationReadiness = {
  session_id: string;
  status: string;
  ready: boolean;
  blockers: Array<{ code: string; count: number; message: string }>;
  checked_at: string;
};

export const getSessionFinalizationReadiness = async (
  sessionId: string
): Promise<FinalizationReadiness> => {
  if (!isMutationSafeOnline()) {
    throw new Error("Session finalization requires an online connection and a completed sync.");
  }

  const localSessionId = await resolveLocalSessionId(sessionId);
  const [sessionEvents, inventoryEvents, reviewEvents] = await Promise.all([
    getPendingSessionEvents(500),
    getPendingInventoryEvents(500),
    getPendingCountLineReviewEvents(500),
  ]);
  const localPending =
    sessionEvents.filter((event) => event.aggregateId === localSessionId).length +
    inventoryEvents.filter(
      (event) =>
        event.payload.session_id === sessionId || event.payload.session_id === localSessionId
    ).length +
    reviewEvents.filter(
      (event) =>
        event.payload.session_id === sessionId || event.payload.session_id === localSessionId
    ).length;

  if (localPending > 0) {
    return {
      session_id: sessionId,
      status: "LOCAL_SYNC_PENDING",
      ready: false,
      blockers: [
        {
          code: "PENDING_LOCAL_SYNC",
          count: localPending,
          message: `${localPending} local change(s) must sync before finalization`,
        },
      ],
      checked_at: new Date().toISOString(),
    };
  }

  const response = await api.get<FinalizationReadiness>(
    `/api/sessions/${sessionId}/finalization-readiness`
  );
  return response.data;
};

export const assertSessionFinalizationReady = async (sessionId: string): Promise<void> => {
  const readiness = await getSessionFinalizationReadiness(sessionId);
  if (!readiness.ready) {
    throw new Error(readiness.blockers.map((blocker) => blocker.message).join("; "));
  }
};

const getCurrentActor = () => {
  const user = useAuthStore.getState().user;
  return {
    username: user?.username || "offline_user",
    fullName: user?.full_name || user?.username || "Offline User",
  };
};

const mapProjectedSessionToDisplay = (
  snapshot: Awaited<ReturnType<typeof getProjectedSessionById>>
) => {
  if (!snapshot) {
    return null;
  }

  const displayId = snapshot.serverSessionId || snapshot.localSessionId;
  const result: Session & {
    _local_session_id: string;
    _server_session_id?: string | null;
    _projection: true;
    _sync_status: string;
  } = {
    id: displayId,
    session_id: snapshot.localSessionId,
    warehouse: snapshot.warehouse,
    staff_user: snapshot.staffUser,
    staff_name: snapshot.staffName,
    status: snapshot.status as Session["status"],
    type: snapshot.type as Session["type"],
    started_at: snapshot.startedAt,
    closed_at: snapshot.closedAt || undefined,
    reconciled_at: snapshot.reconciledAt || undefined,
    completed_at: snapshot.completedAt || undefined,
    finalized_at: snapshot.finalizedAt || undefined,
    finalization_status: snapshot.finalizationStatus || undefined,
    total_items: 0,
    total_variance: 0,
    location_type: snapshot.locationType || undefined,
    location_name: snapshot.locationName || undefined,
    rack_no: snapshot.rackNo || undefined,
    last_heartbeat: snapshot.lastHeartbeat || undefined,
    notes: snapshot.notes || undefined,
    _local_session_id: snapshot.localSessionId,
    _server_session_id: snapshot.serverSessionId,
    _projection: true,
    _sync_status: snapshot.syncStatus,
  };

  return result;
};

const cacheProjectedSession = async (session: ReturnType<typeof mapProjectedSessionToDisplay>) => {
  if (!session) {
    return;
  }
  const cached: CachedSession = {
    ...session,
    cached_at: new Date().toISOString(),
  };
  await cacheSession(cached);
};

const buildSessionStartEvent = (
  params: CreateSessionParams
): Extract<SessionEvent, { type: "SESSION_STARTED" }> => {
  const actor = getCurrentActor();
  const localSessionId = generateOfflineId();
  const startedAt = new Date().toISOString();
  const idempotencyKey = generateUUID();

  return createSessionStartedEvent({
    id: idempotencyKey,
    payload: {
      local_session_id: localSessionId,
      warehouse: params.warehouse || "",
      type: params.type || "STANDARD",
      location_type: params.location_type,
      location_name: params.location_name,
      rack_no: params.rack_no,
      location_id: params.location_id,
      location_path_ids: params.location_path_ids,
      location_path_names: params.location_path_names,
      staff_user: actor.username,
      staff_name: actor.fullName,
      status: "OPEN",
      started_at: startedAt,
      sync_status: "pending",
    },
    meta: {
      idempotencyKey,
      createdBy: actor.username,
      sourceScreen: "session_create",
    },
  });
};

const buildStatusEvent = async (sessionId: string, status: string, note?: string) => {
  const localSessionId = await resolveLocalSessionId(sessionId);
  const actor = getCurrentActor();
  const normalizedStatus = String(status || "").toUpperCase();
  const changedAt = new Date().toISOString();
  const idempotencyKey = generateUUID();

  if (normalizedStatus === "ACTIVE") {
    return createSessionResumedEvent({
      id: idempotencyKey,
      payload: {
        local_session_id: localSessionId,
        resumed_at: changedAt,
        sync_status: "pending",
      },
      meta: {
        idempotencyKey,
        createdBy: actor.username,
        sourceScreen: "session_status",
      },
    });
  }

  return createSessionStatusChangedEvent({
    id: idempotencyKey,
    payload: {
      local_session_id: localSessionId,
      status: normalizedStatus,
      changed_at: changedAt,
      note,
      sync_status: "pending",
    },
    meta: {
      idempotencyKey,
      createdBy: actor.username,
      sourceScreen: "session_status",
    },
  });
};

const buildFinalizeEvent = async (sessionId: string, note?: string) => {
  const localSessionId = await resolveLocalSessionId(sessionId);
  const actor = getCurrentActor();
  const finalizedAt = new Date().toISOString();
  const idempotencyKey = generateUUID();

  return createSessionFinalizedEvent({
    id: idempotencyKey,
    payload: {
      local_session_id: localSessionId,
      finalized_at: finalizedAt,
      note,
      sync_status: "pending",
    },
    meta: {
      idempotencyKey,
      createdBy: actor.username,
      sourceScreen: "session_finalize",
    },
  });
};

const rollbackFailedStartEvent = async (event: SessionEvent): Promise<void> => {
  await markSessionEventFailed(event.id, "Session creation rejected");
  await rebuildSessionProjections();
  const projected = await getProjectedSessionRead(event.aggregateId);
  if (!projected) {
    await removeSessionFromCache(event.aggregateId);
  }
};

type SessionCreatePayload = {
  warehouse?: string;
  type?: string;
  location_type?: string;
  location_name?: string;
  rack_no?: string;
  location_id?: string;
  location_path_ids?: string[];
  location_path_names?: string[];
};

const postSessionToServer = async (
  payload: SessionCreatePayload,
  idempotencyKey: string
): Promise<any> => {
  const response = await api.post(
    "/api/sessions",
    {
      warehouse: payload.warehouse,
      type: payload.type,
      location_type: payload.location_type,
      location_name: payload.location_name,
      rack_no: payload.rack_no,
      location_id: payload.location_id,
      location_path_ids: payload.location_path_ids,
      location_path_names: payload.location_path_names,
    },
    {
      timeout: 3000,
      skipOfflineQueue: true,
      headers: {
        "X-Idempotency-Key": idempotencyKey,
      },
    } as any
  );
  return response.data;
};

const createDirectServerSession = async (params: CreateSessionParams): Promise<any> =>
  postSessionToServer(
    {
      warehouse: params.warehouse,
      type: params.type,
      location_type: params.location_type,
      location_name: params.location_name,
      rack_no: params.rack_no,
      location_id: params.location_id,
      location_path_ids: params.location_path_ids,
      location_path_names: params.location_path_names,
    },
    generateUUID()
  );

const createServerSession = async (event: Extract<SessionEvent, { type: "SESSION_STARTED" }>) => {
  const responseData = await postSessionToServer(
    {
      warehouse: event.payload.warehouse,
      type: event.payload.type,
      location_type: event.payload.location_type,
      location_name: event.payload.location_name,
      rack_no: event.payload.rack_no,
      location_id: event.payload.location_id,
      location_path_ids: event.payload.location_path_ids,
      location_path_names: event.payload.location_path_names,
    },
    event.meta.idempotencyKey
  );
  await bindServerSessionId(event.aggregateId, responseData);
  await markSessionEventSynced(event.id);
  return responseData;
};

const pushSessionStatusToServer = async (
  serverSessionId: string,
  status: string,
  note?: string
) => {
  const normalizedStatus = String(status || "").toUpperCase();
  if (normalizedStatus === "COMPLETED" || normalizedStatus === "FINALIZED") {
    const response = await api.post(
      `/api/sessions/${serverSessionId}/finalize`,
      note ? { note } : {}
    );
    return response.data;
  }

  if (normalizedStatus === "CLOSED") {
    const response = await api.put(`/api/sessions/${serverSessionId}/status?status=RECONCILE`);
    return response.data;
  }

  const response = await api.put(
    `/api/sessions/${serverSessionId}/status?status=${encodeURIComponent(normalizedStatus)}`
  );
  return response.data;
};

const syncSessionEvent = async (event: SessionEvent): Promise<any> => {
  if (isSessionStartedEvent(event)) {
    return createServerSession(event);
  }

  const serverSessionId = await resolveServerSessionId(event.aggregateId);
  if (!serverSessionId) {
    throw new Error("Pending session start must sync before dependent session events.");
  }

  if (event.type === "SESSION_FINALIZED") {
    const response = await api.post(
      `/api/sessions/${serverSessionId}/finalize`,
      event.payload.note ? { note: event.payload.note } : {},
      {
        skipOfflineQueue: true,
        headers: { "X-Idempotency-Key": event.meta.idempotencyKey },
      } as any
    );
    await bindServerSessionId(event.aggregateId, response.data);
    await markSessionEventSynced(event.id);
    return response.data;
  }

  if (event.type === "SESSION_STATUS_CHANGED") {
    const response = await pushSessionStatusToServer(
      serverSessionId,
      event.payload.status,
      event.payload.note
    );
    await bindServerSessionId(event.aggregateId, response);
    await markSessionEventSynced(event.id);
    return response;
  }

  if (event.type === "SESSION_RESUMED") {
    const response = await pushSessionStatusToServer(serverSessionId, "ACTIVE");
    await bindServerSessionId(event.aggregateId, response);
    await markSessionEventSynced(event.id);
    return response;
  }

  await markSessionEventSynced(event.id);
  return { localOnly: true };
};

export class SessionControlPlaneError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "SessionControlPlaneError";
  }
}

export const createSessionCommand = async (params: CreateSessionParams): Promise<any> => {
  if (!controlPlaneFlags.enableEventDrivenSessions) {
    return api
      .post("/api/sessions", params, {
        timeout: 3000,
        skipOfflineQueue: true,
      } as any)
      .then((response) => response.data);
  }

  const canAttemptApi = shouldAttemptSessionApi();
  let directCreateError: unknown = null;

  if (canAttemptApi) {
    try {
      return await createDirectServerSession(params);
    } catch (error) {
      if (isServerValidationError(error)) {
        throw new SessionControlPlaneError(
          "SESSION_CREATE_REJECTED",
          readErrorMessage(error, "Session creation failed")
        );
      }
      directCreateError = error;
    }
  }

  const locationKey = buildSessionLocationKey({
    warehouse: params.warehouse || null,
    locationType: params.location_type || null,
    locationName: params.location_name || null,
    rackNo: params.rack_no || null,
  });
  const existing = await findActiveProjectedSessionForLocation(locationKey);
  if (existing) {
    throw new SessionControlPlaneError(
      "SESSION_ALREADY_ACTIVE",
      "A session for this location is already active."
    );
  }

  const event = buildSessionStartEvent(params);
  await recordSessionEvent(event);
  controlPlaneEventBus.publish("session.changed", {
    sessionId: event.aggregateId,
    localSessionId: event.aggregateId,
    reason: "recorded",
  });

  const projected = await getProjectedSessionRead(event.aggregateId);
  await cacheProjectedSession(projected);

  if (!canAttemptApi) {
    return {
      ...projected,
      _offline: true,
      _source: "local",
      _controlPlane: true,
      _createdOffline: true,
    };
  }

  if (directCreateError) {
    await markSessionEventRetry(event.id, readErrorMessage(directCreateError, "Network error"));
    incrementControlPlaneMetric("sync_retry_count");
    controlPlaneEventBus.publish("session.changed", {
      sessionId: event.aggregateId,
      localSessionId: event.aggregateId,
      reason: "retry",
    });
    const retryView = await getProjectedSessionRead(event.aggregateId);
    await cacheProjectedSession(retryView);
    return {
      ...retryView,
      _offline: true,
      _source: "local",
      _degraded: true,
      _controlPlane: true,
      _createdOffline: true,
    };
  }

  try {
    const response = await createServerSession(event);
    const display = await getProjectedSessionRead(event.aggregateId);
    await cacheProjectedSession(display);
    controlPlaneEventBus.publish("session.changed", {
      sessionId: response?.id || event.aggregateId,
      localSessionId: event.aggregateId,
      reason: "synced",
    });
    return {
      ...response,
      _local_session_id: event.aggregateId,
      _controlPlane: true,
    };
  } catch (error) {
    if (isServerValidationError(error)) {
      await rollbackFailedStartEvent(event);
      incrementControlPlaneMetric("sync_failure_count");
      throw new SessionControlPlaneError(
        "SESSION_CREATE_REJECTED",
        readErrorMessage(error, "Session creation failed")
      );
    }

    await markSessionEventRetry(event.id, readErrorMessage(error, "Network error"));
    incrementControlPlaneMetric("sync_retry_count");
    controlPlaneEventBus.publish("session.changed", {
      sessionId: event.aggregateId,
      localSessionId: event.aggregateId,
      reason: "retry",
    });
    const retryView = await getProjectedSessionRead(event.aggregateId);
    await cacheProjectedSession(retryView);
    return {
      ...retryView,
      _offline: true,
      _source: "local",
      _degraded: true,
      _controlPlane: true,
      _createdOffline: true,
    };
  }
};

export const updateSessionStatusCommand = async (
  sessionId: string,
  status: string,
  note?: string
): Promise<any> => {
  if (!controlPlaneFlags.enableEventDrivenSessions) {
    return pushSessionStatusToServer(sessionId, status, note);
  }

  const event = await buildStatusEvent(sessionId, status, note);
  await recordSessionEvent(event);
  controlPlaneEventBus.publish("session.changed", {
    sessionId,
    localSessionId: event.aggregateId,
    reason: "status_changed",
  });
  const projected = await getProjectedSessionRead(sessionId);
  await cacheProjectedSession(projected);

  if (!isMutationSafeOnline()) {
    return {
      ...projected,
      _offline: true,
      _source: "local",
      _controlPlane: true,
    };
  }

  try {
    const response = await syncSessionEvent(event);
    const display = await getProjectedSessionRead(sessionId);
    await cacheProjectedSession(display);
    controlPlaneEventBus.publish("session.changed", {
      sessionId,
      localSessionId: event.aggregateId,
      reason: "synced",
    });
    return response;
  } catch (error) {
    if (isServerValidationError(error)) {
      await markSessionEventFailed(event.id, readErrorMessage(error, "Session status rejected"));
      await rebuildSessionProjections();
      incrementControlPlaneMetric("sync_failure_count");
      controlPlaneEventBus.publish("session.changed", {
        sessionId,
        localSessionId: event.aggregateId,
        reason: "failed",
      });
      throw error;
    }
    await markSessionEventRetry(event.id, readErrorMessage(error, "Network error"));
    incrementControlPlaneMetric("sync_retry_count");
    controlPlaneEventBus.publish("session.changed", {
      sessionId,
      localSessionId: event.aggregateId,
      reason: "retry",
    });
    return {
      ...projected,
      _offline: true,
      _source: "local",
      _degraded: true,
      _controlPlane: true,
    };
  }
};

export const finalizeSessionCommand = async (
  sessionId: string,
  payload?: { note?: string }
): Promise<any> => {
  await assertSessionFinalizationReady(sessionId);

  if (!controlPlaneFlags.enableEventDrivenSessions) {
    return api
      .post(`/api/sessions/${sessionId}/finalize`, payload || {})
      .then((response) => response.data);
  }

  const event = await buildFinalizeEvent(sessionId, payload?.note);
  await recordSessionEvent(event);
  controlPlaneEventBus.publish("session.changed", {
    sessionId,
    localSessionId: event.aggregateId,
    reason: "finalized",
  });
  const projected = await getProjectedSessionRead(sessionId);
  await cacheProjectedSession(projected);

  if (!isMutationSafeOnline()) {
    return {
      ...projected,
      _offline: true,
      _source: "local",
      _controlPlane: true,
    };
  }

  try {
    const response = await syncSessionEvent(event);
    const display = await getProjectedSessionRead(sessionId);
    await cacheProjectedSession(display);
    controlPlaneEventBus.publish("session.changed", {
      sessionId,
      localSessionId: event.aggregateId,
      reason: "synced",
    });
    return response;
  } catch (error) {
    if (isServerValidationError(error)) {
      await markSessionEventFailed(
        event.id,
        readErrorMessage(error, "Session finalization rejected")
      );
      await rebuildSessionProjections();
      incrementControlPlaneMetric("sync_failure_count");
      controlPlaneEventBus.publish("session.changed", {
        sessionId,
        localSessionId: event.aggregateId,
        reason: "failed",
      });
      throw error;
    }
    await markSessionEventRetry(event.id, readErrorMessage(error, "Network error"));
    incrementControlPlaneMetric("sync_retry_count");
    controlPlaneEventBus.publish("session.changed", {
      sessionId,
      localSessionId: event.aggregateId,
      reason: "retry",
    });
    return {
      ...projected,
      _offline: true,
      _source: "local",
      _degraded: true,
      _controlPlane: true,
    };
  }
};

export const recordSessionHeartbeatCommand = async (sessionId: string) => {
  if (!controlPlaneFlags.enableEventDrivenSessions) {
    return null;
  }

  const localSessionId = await resolveLocalSessionId(sessionId);
  const actor = getCurrentActor();
  const event = createSessionHeartbeatEvent({
    payload: {
      local_session_id: localSessionId,
      heartbeat_at: new Date().toISOString(),
      sync_status: "pending",
    },
    meta: {
      idempotencyKey: generateUUID(),
      createdBy: actor.username,
      sourceScreen: "session_heartbeat",
    },
  });
  await recordSessionEvent(event);
  controlPlaneEventBus.publish("session.changed", {
    sessionId,
    localSessionId,
    reason: "heartbeat",
  });
  const projected = await getProjectedSessionRead(sessionId);
  await cacheProjectedSession(projected);
  return projected;
};

export const syncPendingSessionEvents = async (): Promise<{
  success: number;
  failed: number;
  total: number;
  errors: { id: string; error: string }[];
}> => {
  if (!controlPlaneFlags.enableEventDrivenSessions) {
    return { success: 0, failed: 0, total: 0, errors: [] };
  }

  const events = await getPendingSessionEvents();
  if (events.length === 0) {
    return { success: 0, failed: 0, total: 0, errors: [] };
  }

  let success = 0;
  let failed = 0;
  const errors: { id: string; error: string }[] = [];

  for (const event of events) {
    try {
      await syncSessionEvent(event);
      success += 1;
      incrementControlPlaneMetric("sync_success_count");
      controlPlaneEventBus.publish("session.changed", {
        sessionId: event.aggregateId,
        localSessionId: event.aggregateId,
        reason: "synced",
      });
    } catch (error) {
      const message = readErrorMessage(error, "Failed to sync session event");
      if (isServerValidationError(error)) {
        await markSessionEventFailed(event.id, message);
        await rebuildSessionProjections();
        incrementControlPlaneMetric("sync_failure_count");
        controlPlaneEventBus.publish("session.changed", {
          sessionId: event.aggregateId,
          localSessionId: event.aggregateId,
          reason: "failed",
        });
      } else {
        await markSessionEventRetry(event.id, message);
        incrementControlPlaneMetric("sync_retry_count");
        controlPlaneEventBus.publish("session.changed", {
          sessionId: event.aggregateId,
          localSessionId: event.aggregateId,
          reason: "retry",
        });
      }
      failed += 1;
      errors.push({ id: event.id, error: message });
      break;
    }
  }

  return {
    success,
    failed,
    total: events.length,
    errors,
  };
};

export const getProjectedSessionRead = async (sessionId: string) =>
  mapProjectedSessionToDisplay(await getProjectedSessionById(sessionId));

export const getProjectedSessionsRead = async () => {
  const sessions = await getProjectedSessions();
  return sessions
    .map((session) => mapProjectedSessionToDisplay(session))
    .filter(Boolean) as Exclude<ReturnType<typeof mapProjectedSessionToDisplay>, null>[];
};
