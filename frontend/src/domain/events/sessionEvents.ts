import { generateUUID } from "@/utils/uuid";

export type SessionSyncStatus = "pending" | "pending_retry" | "synced" | "failed";

export type SessionEventMeta = {
  idempotencyKey: string;
  createdBy: string;
  sourceScreen: string;
};

export type SessionStartedPayload = {
  local_session_id: string;
  warehouse: string;
  type: string;
  location_type?: string;
  location_name?: string;
  rack_no?: string;
  location_id?: string;
  location_path_ids?: string[];
  location_path_names?: string[];
  staff_user: string;
  staff_name: string;
  status: string;
  started_at: string;
  sync_status: SessionSyncStatus;
};

export type SessionStatusChangedPayload = {
  local_session_id: string;
  status: string;
  changed_at: string;
  note?: string;
  sync_status: SessionSyncStatus;
};

export type SessionResumedPayload = {
  local_session_id: string;
  resumed_at: string;
  sync_status: SessionSyncStatus;
};

export type SessionHeartbeatPayload = {
  local_session_id: string;
  heartbeat_at: string;
  sync_status: SessionSyncStatus;
};

export type SessionFinalizedPayload = {
  local_session_id: string;
  finalized_at: string;
  note?: string;
  sync_status: SessionSyncStatus;
};

export type SessionEvent =
  | {
      id: string;
      type: "SESSION_STARTED";
      aggregateId: string;
      payload: SessionStartedPayload;
      meta: SessionEventMeta;
      ts: number;
    }
  | {
      id: string;
      type: "SESSION_STATUS_CHANGED";
      aggregateId: string;
      payload: SessionStatusChangedPayload;
      meta: SessionEventMeta;
      ts: number;
    }
  | {
      id: string;
      type: "SESSION_RESUMED";
      aggregateId: string;
      payload: SessionResumedPayload;
      meta: SessionEventMeta;
      ts: number;
    }
  | {
      id: string;
      type: "SESSION_HEARTBEAT";
      aggregateId: string;
      payload: SessionHeartbeatPayload;
      meta: SessionEventMeta;
      ts: number;
    }
  | {
      id: string;
      type: "SESSION_FINALIZED";
      aggregateId: string;
      payload: SessionFinalizedPayload;
      meta: SessionEventMeta;
      ts: number;
    };

type EventFactoryInput<TPayload> = {
  id?: string;
  payload: TPayload;
  meta: SessionEventMeta;
  ts?: number;
};

const buildSessionEvent = <TType extends SessionEvent["type"], TPayload>(
  type: TType,
  input: EventFactoryInput<TPayload> & { aggregateId: string }
) =>
  ({
    id: input.id || input.meta.idempotencyKey || generateUUID(),
    type,
    aggregateId: input.aggregateId,
    payload: input.payload,
    meta: input.meta,
    ts: input.ts ?? Date.now(),
  }) as unknown as Extract<SessionEvent, { type: TType }>;

export const createSessionStartedEvent = (
  input: EventFactoryInput<SessionStartedPayload>
): Extract<SessionEvent, { type: "SESSION_STARTED" }> =>
  buildSessionEvent("SESSION_STARTED", {
    ...input,
    aggregateId: input.payload.local_session_id,
  });

export const createSessionStatusChangedEvent = (
  input: EventFactoryInput<SessionStatusChangedPayload>
): Extract<SessionEvent, { type: "SESSION_STATUS_CHANGED" }> =>
  buildSessionEvent("SESSION_STATUS_CHANGED", {
    ...input,
    aggregateId: input.payload.local_session_id,
  });

export const createSessionResumedEvent = (
  input: EventFactoryInput<SessionResumedPayload>
): Extract<SessionEvent, { type: "SESSION_RESUMED" }> =>
  buildSessionEvent("SESSION_RESUMED", {
    ...input,
    aggregateId: input.payload.local_session_id,
  });

export const createSessionHeartbeatEvent = (
  input: EventFactoryInput<SessionHeartbeatPayload>
): Extract<SessionEvent, { type: "SESSION_HEARTBEAT" }> =>
  buildSessionEvent("SESSION_HEARTBEAT", {
    ...input,
    aggregateId: input.payload.local_session_id,
  });

export const createSessionFinalizedEvent = (
  input: EventFactoryInput<SessionFinalizedPayload>
): Extract<SessionEvent, { type: "SESSION_FINALIZED" }> =>
  buildSessionEvent("SESSION_FINALIZED", {
    ...input,
    aggregateId: input.payload.local_session_id,
  });

export const isSessionStartedEvent = (
  event: SessionEvent
): event is Extract<SessionEvent, { type: "SESSION_STARTED" }> => event.type === "SESSION_STARTED";
