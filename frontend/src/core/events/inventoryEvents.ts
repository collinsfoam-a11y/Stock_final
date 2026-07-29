import type { CreateCountLinePayload } from "@/types/scan";
import { CONTROL_PLANE_PROJECTION_VERSION } from "@/core/config/controlPlaneFlags";

export type InventoryEventType = "COUNT_LINE_RECORDED";
export type InventoryEventSyncStatus = "pending" | "pending_retry" | "synced" | "failed";

export interface InventoryEventMeta {
  sessionId: string;
  deviceId?: string | null;
  sourceScreen?: string | null;
  idempotencyKey: string;
  scanFingerprint?: string | null;
  createdBy?: string | null;
  projectionVersion: string;
}

export interface CountLineRecordedPayload extends CreateCountLinePayload {
  local_line_id: string;
  counted_at: string;
  counted_by: string;
  sync_status: InventoryEventSyncStatus;
}

export interface CountLineRecordedEvent {
  id: string;
  type: "COUNT_LINE_RECORDED";
  aggregateId: string;
  payload: CountLineRecordedPayload;
  meta: InventoryEventMeta;
  ts: number;
}

export type InventoryEvent = CountLineRecordedEvent;

export const createCountLineRecordedEvent = (params: {
  id: string;
  payload: CountLineRecordedPayload;
  meta: Omit<InventoryEventMeta, "projectionVersion">;
  ts?: number;
}): CountLineRecordedEvent => {
  const timestamp = params.ts ?? Date.now();

  return {
    id: params.id,
    type: "COUNT_LINE_RECORDED",
    aggregateId: `${params.payload.session_id}:${params.payload.item_code}`,
    payload: params.payload,
    meta: {
      ...params.meta,
      projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
    },
    ts: timestamp,
  };
};

export const isCountLineRecordedEvent = (event: InventoryEvent): event is CountLineRecordedEvent =>
  event.type === "COUNT_LINE_RECORDED";
