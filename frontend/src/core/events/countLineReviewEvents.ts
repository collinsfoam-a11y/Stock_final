import { CONTROL_PLANE_PROJECTION_VERSION } from "@/core/config/controlPlaneFlags";
import { generateUUID } from "@/utils/uuid";

export type CountLineReviewSyncStatus = "pending" | "pending_retry" | "synced" | "failed";

export type CountLineReviewEventMeta = {
  idempotencyKey: string;
  createdBy: string;
  sourceScreen: string;
  projectionVersion: string;
};

export type CountLineApprovedPayload = {
  line_id: string;
  session_id?: string | null;
  approved_at: string;
  approved_by: string;
  notes?: string | null;
  sync_status: CountLineReviewSyncStatus;
};

export type CountLineRejectedPayload = {
  line_id: string;
  session_id?: string | null;
  rejected_at: string;
  rejected_by: string;
  notes?: string | null;
  assign_to?: string | null;
  sync_status: CountLineReviewSyncStatus;
};

export type StockVerifiedPayload = {
  line_id: string;
  session_id?: string | null;
  verified_at: string;
  verified_by: string;
  sync_status: CountLineReviewSyncStatus;
};

export type StockUnverifiedPayload = {
  line_id: string;
  session_id?: string | null;
  unverified_at: string;
  unverified_by: string;
  sync_status: CountLineReviewSyncStatus;
};

export type CountLineReviewEvent =
  | {
      id: string;
      type: "COUNT_LINE_APPROVED";
      aggregateId: string;
      payload: CountLineApprovedPayload;
      meta: CountLineReviewEventMeta;
      ts: number;
    }
  | {
      id: string;
      type: "COUNT_LINE_REJECTED";
      aggregateId: string;
      payload: CountLineRejectedPayload;
      meta: CountLineReviewEventMeta;
      ts: number;
    }
  | {
      id: string;
      type: "STOCK_VERIFIED";
      aggregateId: string;
      payload: StockVerifiedPayload;
      meta: CountLineReviewEventMeta;
      ts: number;
    }
  | {
      id: string;
      type: "STOCK_UNVERIFIED";
      aggregateId: string;
      payload: StockUnverifiedPayload;
      meta: CountLineReviewEventMeta;
      ts: number;
    };

type EventFactoryInput<TPayload> = {
  id?: string;
  payload: TPayload;
  meta: Omit<CountLineReviewEventMeta, "projectionVersion">;
  ts?: number;
};

const buildEvent = <
  TType extends CountLineReviewEvent["type"],
  TPayload extends { line_id: string },
>(
  type: TType,
  input: EventFactoryInput<TPayload>
) =>
  ({
    id: input.id || input.meta.idempotencyKey || generateUUID(),
    type,
    aggregateId: input.payload.line_id,
    payload: input.payload,
    meta: {
      ...input.meta,
      projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
    },
    ts: input.ts ?? Date.now(),
  }) as unknown as Extract<CountLineReviewEvent, { type: TType }>;

export const createCountLineApprovedEvent = (
  input: EventFactoryInput<CountLineApprovedPayload>
): Extract<CountLineReviewEvent, { type: "COUNT_LINE_APPROVED" }> =>
  buildEvent("COUNT_LINE_APPROVED", input);

export const createCountLineRejectedEvent = (
  input: EventFactoryInput<CountLineRejectedPayload>
): Extract<CountLineReviewEvent, { type: "COUNT_LINE_REJECTED" }> =>
  buildEvent("COUNT_LINE_REJECTED", input);

export const createStockVerifiedEvent = (
  input: EventFactoryInput<StockVerifiedPayload>
): Extract<CountLineReviewEvent, { type: "STOCK_VERIFIED" }> => buildEvent("STOCK_VERIFIED", input);

export const createStockUnverifiedEvent = (
  input: EventFactoryInput<StockUnverifiedPayload>
): Extract<CountLineReviewEvent, { type: "STOCK_UNVERIFIED" }> =>
  buildEvent("STOCK_UNVERIFIED", input);
