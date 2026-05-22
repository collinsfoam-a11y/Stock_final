import api, { updateBaseURL } from "@/services/httpClient";
import { resolveBackendUrl } from "@/services/backendUrl";
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
import {
  cacheSession,
  removeSessionFromCache,
  type CachedSession,
} from "@/services/offline/offlineStorage";
import { incrementControlPlaneMetric } from "@/services/observability/controlPlaneMetrics";
import { controlPlaneEventBus } from "@/services/control-plane/controlPlaneEventBus";
import { getNetworkStatus } from "@/utils/network";
import { isLocalDbUnavailableError } from "@/db/localDbErrors";

const isServerValidationError = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return typeof status === "number" && status >= 400 && status < 500;
};

const readErrorMessage = (error: unknown, fallback: string): string =>
  (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
  (error instanceof Error ? error.message : fallback);

const isMutationSafeOnline = () => getNetworkStatus().status === "ONLINE";
const canAttemptServerMutation = () => getNetworkStatus().status !== "OFFLINE";
// Session creation can include snapshot and projection writes on the backend.
const SESSION_MUTATION_TIMEOUT_MS = 45000;

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

const createServerSessionFromParams = async (
  params: CreateSessionParams,
  idempotencyKey?: string
) => {
  const response = await api.post(
    "/api/sessions",
    {
      warehouse: params.warehouse || "",
      type: params.type || "STANDARD",
      location_type: params.location_type,
      location_name: params.location_name,
      rack_no: params.rack_no,
    },
    {
      timeout: SESSION_MUTATION_TIMEOUT_MS,
      skipOfflineQueue: true,
      ...(idempotencyKey
        ? {
            headers: {
              "X-Idempotency-Key": idempotencyKey,
            },
          }
        : {}),
    } as any
  );
  return response.data;
};

const markServerSessionSynced = async (event: SessionEvent, serverSession: any): Promise<void> => {
  try {
    await bindServerSessionId(event.aggregateId, serverSession);
    await markSessionEventSynced(event.id);
  } catch (error) {
    if (!isLocalDbUnavailableError(error)) {
      throw error;
    }
    incrementControlPlaneMetric("projection_fallback_count");
  }
};

const cacheProjectedSessionBestEffort = async (
  sessionId: string
): Promise<Awaited<ReturnType<typeof getProjectedSessionRead>> | null> => {
  try {
    const display = await getProjectedSessionRead(sessionId);
    await cacheProjectedSession(display);
    return display;
  } catch (error) {
    if (!isLocalDbUnavailableError(error)) {
      throw error;
    }
    incrementControlPlaneMetric("projection_fallback_count");
    return null;
  }
};

const createServerSession = async (event: Extract<SessionEvent, { type: "SESSION_STARTED" }>) => {
  const responseData = await createServerSessionFromParams(
    {
      warehouse: event.payload.warehouse,
      type: event.payload.type,
      location_type: event.payload.location_type,
      location_name: event.payload.location_name,
      rack_no: event.payload.rack_no,
    },
    event.meta.idempotencyKey
  );
  await markServerSessionSynced(event, responseData);
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
    await markServerSessionSynced(event, response.data);
    return response.data;
  }

  if (event.type === "SESSION_STATUS_CHANGED") {
    const response = await pushSessionStatusToServer(
      serverSessionId,
      event.payload.status,
      event.payload.note
    );
    await markServerSessionSynced(event, response);
    return response;
  }

  if (event.type === "SESSION_RESUMED") {
    const response = await pushSessionStatusToServer(serverSessionId, "ACTIVE");
    await markServerSessionSynced(event, response);
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

const localStorageUnavailableError = () =>
  new SessionControlPlaneError(
    "LOCAL_STORAGE_UNAVAILABLE",
    "Local session storage is unavailable. Connect to the backend and try again."
  );

const createServerSessionDirectWhenStorageUnavailable = async (
  params: CreateSessionParams,
  idempotencyKey: string,
  error: unknown
) => {
  if (!isLocalDbUnavailableError(error)) {
    throw error;
  }

  incrementControlPlaneMetric("projection_fallback_count");
  if (!canAttemptServerMutation()) {
    throw localStorageUnavailableError();
  }

  // On web with HTTP+IP access, the initial baseURL is the Expo dev server origin
  // (e.g. http://192.168.x.x:8082) until ConnectionManager finishes probing.
  // Resolve the actual backend URL before the POST so it reaches the right server.
  try {
    const resolvedUrl = await resolveBackendUrl();
    updateBaseURL(resolvedUrl);
  } catch {
    // Best-effort; proceed with current baseURL on resolution failure
  }

  try {
    const response = await createServerSessionFromParams(params, idempotencyKey);
    return {
      ...response,
      _controlPlane: true,
      _projection_unavailable: true,
    };
  } catch (serverError) {
    if (isServerValidationError(serverError)) {
      throw new SessionControlPlaneError(
        "SESSION_CREATE_REJECTED",
        readErrorMessage(serverError, "Session creation failed")
      );
    }
    const networkMessage =
      (serverError as any)?.userMessage ||
      readErrorMessage(serverError, "Unable to create session. Check your network connection.");
    throw new SessionControlPlaneError("SESSION_CREATE_NETWORK_ERROR", networkMessage);
  }
};

const pushSessionStatusDirectWhenStorageUnavailable = async (
  sessionId: string,
  status: string,
  note: string | undefined,
  error: unknown
) => {
  if (!isLocalDbUnavailableError(error)) {
    throw error;
  }

  incrementControlPlaneMetric("projection_fallback_count");
  if (!canAttemptServerMutation()) {
    throw localStorageUnavailableError();
  }

  const response = await pushSessionStatusToServer(sessionId, status, note);
  return {
    ...response,
    _controlPlane: true,
    _projection_unavailable: true,
  };
};

export const createSessionCommand = async (params: CreateSessionParams): Promise<any> => {
  if (!controlPlaneFlags.enableEventDrivenSessions) {
    return api
      .post("/api/sessions", params, {
        timeout: SESSION_MUTATION_TIMEOUT_MS,
        skipOfflineQueue: true,
      } as any)
      .then((response) => response.data);
  }

  const event = buildSessionStartEvent(params);
  const locationKey = buildSessionLocationKey({
    warehouse: params.warehouse || null,
    locationType: params.location_type || null,
    locationName: params.location_name || null,
    rackNo: params.rack_no || null,
  });

  let projected: Awaited<ReturnType<typeof getProjectedSessionRead>>;
  try {
    const existing = await findActiveProjectedSessionForLocation(locationKey);
    if (existing) {
      throw new SessionControlPlaneError(
        "SESSION_ALREADY_ACTIVE",
        "A session for this location is already active."
      );
    }

    await recordSessionEvent(event);
    controlPlaneEventBus.publish("session.changed", {
      sessionId: event.aggregateId,
      localSessionId: event.aggregateId,
      reason: "recorded",
    });

    projected = await getProjectedSessionRead(event.aggregateId);
    await cacheProjectedSession(projected);
  } catch (error) {
    if (error instanceof SessionControlPlaneError) {
      throw error;
    }
    return createServerSessionDirectWhenStorageUnavailable(
      params,
      event.meta.idempotencyKey,
      error
    );
  }

  if (!isMutationSafeOnline()) {
    return {
      ...projected,
      _offline: true,
      _source: "local",
      _controlPlane: true,
      _createdOffline: true,
    };
  }

  try {
    const response = await createServerSession(event);
    await cacheProjectedSessionBestEffort(event.aggregateId);
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

  let event: Awaited<ReturnType<typeof buildStatusEvent>>;
  let projected: Awaited<ReturnType<typeof getProjectedSessionRead>>;
  try {
    event = await buildStatusEvent(sessionId, status, note);
    await recordSessionEvent(event);
    controlPlaneEventBus.publish("session.changed", {
      sessionId,
      localSessionId: event.aggregateId,
      reason: "status_changed",
    });
    projected = await getProjectedSessionRead(sessionId);
    await cacheProjectedSession(projected);
  } catch (error) {
    return pushSessionStatusDirectWhenStorageUnavailable(sessionId, status, note, error);
  }

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
    await cacheProjectedSessionBestEffort(sessionId);
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
  if (!controlPlaneFlags.enableEventDrivenSessions) {
    return api
      .post(`/api/sessions/${sessionId}/finalize`, payload || {})
      .then((response) => response.data);
  }

  let event: Awaited<ReturnType<typeof buildFinalizeEvent>>;
  let projected: Awaited<ReturnType<typeof getProjectedSessionRead>>;
  try {
    event = await buildFinalizeEvent(sessionId, payload?.note);
    await recordSessionEvent(event);
    controlPlaneEventBus.publish("session.changed", {
      sessionId,
      localSessionId: event.aggregateId,
      reason: "finalized",
    });
    projected = await getProjectedSessionRead(sessionId);
    await cacheProjectedSession(projected);
  } catch (error) {
    return pushSessionStatusDirectWhenStorageUnavailable(
      sessionId,
      "FINALIZED",
      payload?.note,
      error
    );
  }

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
    await cacheProjectedSessionBestEffort(sessionId);
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

  try {
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
  } catch (error) {
    if (!isLocalDbUnavailableError(error)) {
      throw error;
    }
    incrementControlPlaneMetric("projection_fallback_count");
    return null;
  }
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

  let events: SessionEvent[];
  try {
    events = await getPendingSessionEvents();
  } catch (error) {
    if (!isLocalDbUnavailableError(error)) {
      throw error;
    }
    incrementControlPlaneMetric("projection_fallback_count");
    return { success: 0, failed: 0, total: 0, errors: [] };
  }
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
