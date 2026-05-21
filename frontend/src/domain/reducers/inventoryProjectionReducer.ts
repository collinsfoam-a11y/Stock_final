import { CONTROL_PLANE_PROJECTION_VERSION } from "@/core/config/controlPlaneFlags";
import type { CountLineBatch } from "@/types/scan";
import type {
  CountLineRecordedEvent,
  CountLineRecordedPayload,
} from "@/domain/events/inventoryEvents";

export interface ProjectedCountLineRecord {
  eventId: string;
  serverLineId: string | null;
  sessionId: string;
  itemCode: string;
  itemName: string;
  countedQty: number;
  damagedQty: number;
  floorNo: string | null;
  rackNo: string | null;
  countedBy: string;
  countedAt: string;
  syncStatus: string;
  payloadJson: string;
  projectionVersion: string;
}

export interface ProjectedItemSnapshot {
  sessionId: string;
  itemCode: string;
  itemName: string;
  totalQty: number;
  totalDamageQty: number;
  lineCount: number;
  updatedAt: string;
  projectionVersion: string;
}

export interface ProjectedBatchRecord {
  sessionId: string;
  itemCode: string;
  batchId: string;
  qty: number;
  mrp: number | null;
  updatedAt: string;
  projectionVersion: string;
}

const toBatchRecords = (payload: CountLineRecordedPayload): ProjectedBatchRecord[] => {
  const updatedAt = payload.counted_at;
  const batches = Array.isArray(payload.batches) ? payload.batches : [];
  if (batches.length > 0) {
    return batches
      .map((batch) => normalizeBatchRecord(payload, batch, updatedAt))
      .filter((record): record is ProjectedBatchRecord => record !== null);
  }

  if (!payload.batch_id) {
    return [];
  }

  return [
    {
      sessionId: payload.session_id,
      itemCode: payload.item_code,
      batchId: payload.batch_id,
      qty: payload.counted_qty,
      mrp: payload.mrp_counted ?? null,
      updatedAt,
      projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
    },
  ];
};

const normalizeBatchRecord = (
  payload: CountLineRecordedPayload,
  batch: CountLineBatch,
  updatedAt: string
): ProjectedBatchRecord | null => {
  const batchId =
    batch.batch_id || batch.batch_no || batch.batch_number || payload.batch_id || batch.barcode || null;
  if (!batchId) {
    return null;
  }

  return {
    sessionId: payload.session_id,
    itemCode: payload.item_code,
    batchId,
    qty: Number(batch.quantity ?? 0),
    mrp:
      typeof batch.mrp === "number"
        ? batch.mrp
        : typeof payload.mrp_counted === "number"
          ? payload.mrp_counted
          : null,
    updatedAt,
    projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
  };
};

export const buildProjectedCountLineRecord = (
  event: CountLineRecordedEvent
): ProjectedCountLineRecord => ({
  eventId: event.id,
  serverLineId: null,
  sessionId: event.payload.session_id,
  itemCode: event.payload.item_code,
  itemName: event.payload.item_name?.trim() || event.payload.item_code,
  countedQty: event.payload.counted_qty,
  damagedQty: event.payload.damaged_qty ?? 0,
  floorNo: event.payload.floor_no ?? null,
  rackNo: event.payload.rack_no ?? null,
  countedBy: event.payload.counted_by,
  countedAt: event.payload.counted_at,
  syncStatus: event.payload.sync_status,
  payloadJson: JSON.stringify(event.payload),
  projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
});

export const buildProjectedItemSnapshot = (
  event: CountLineRecordedEvent,
  previous?: ProjectedItemSnapshot | null
): ProjectedItemSnapshot => ({
  sessionId: event.payload.session_id,
  itemCode: event.payload.item_code,
  itemName: event.payload.item_name?.trim() || previous?.itemName || event.payload.item_code,
  totalQty: (previous?.totalQty ?? 0) + event.payload.counted_qty,
  totalDamageQty: (previous?.totalDamageQty ?? 0) + (event.payload.damaged_qty ?? 0),
  lineCount: (previous?.lineCount ?? 0) + 1,
  updatedAt: event.payload.counted_at,
  projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
});

export const buildProjectedBatchRecords = (event: CountLineRecordedEvent): ProjectedBatchRecord[] =>
  toBatchRecords(event.payload);
