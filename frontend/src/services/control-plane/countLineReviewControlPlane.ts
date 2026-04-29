import api from "@/services/httpClient";
import { useAuthStore } from "@/store/authStore";
import { controlPlaneFlags } from "@/core/config/controlPlaneFlags";
import { generateUUID } from "@/utils/uuid";
import {
  createCountLineApprovedEvent,
  createCountLineRejectedEvent,
  createStockUnverifiedEvent,
  createStockVerifiedEvent,
  type CountLineReviewEvent,
} from "@/domain/events/countLineReviewEvents";
import {
  getPendingCountLineReviewEvents,
  getProjectedCountLineReviewStates,
  markCountLineReviewEventFailed,
  markCountLineReviewEventRetry,
  markCountLineReviewEventSynced,
  rebuildCountLineReviewProjections,
  recordCountLineReviewEvent,
} from "@/data/repositories/countLineReviewControlPlaneRepository";
import { resolveProjectedServerCountLineId } from "@/data/repositories/inventoryControlPlaneRepository";
import { incrementControlPlaneMetric } from "@/services/observability/controlPlaneMetrics";
import { controlPlaneEventBus } from "@/services/control-plane/controlPlaneEventBus";
import { getNetworkStatus } from "@/utils/network";

type ReviewCommandOptions = {
  session_id?: string;
  notes?: string;
  assign_to?: string;
};

const isOnline = () => getNetworkStatus().status === "ONLINE";

const getCurrentActor = () => {
  const user = useAuthStore.getState().user;
  return {
    username: user?.username || "offline_user",
  };
};

const isServerValidationError = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return typeof status === "number" && status >= 400 && status < 500;
};

const extractServerLineId = async (lineId: string): Promise<string | null> =>
  resolveProjectedServerCountLineId(lineId);

const buildReviewError = (fallback: string, error: unknown): string =>
  (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
  (error instanceof Error ? error.message : fallback);

const buildApproveEvent = (lineId: string, options?: ReviewCommandOptions) => {
  const actor = getCurrentActor();
  const approvedAt = new Date().toISOString();
  const idempotencyKey = generateUUID();
  return createCountLineApprovedEvent({
    id: idempotencyKey,
    payload: {
      line_id: lineId,
      session_id: options?.session_id,
      approved_at: approvedAt,
      approved_by: actor.username,
      notes: options?.notes,
      sync_status: "pending",
    },
    meta: {
      idempotencyKey,
      createdBy: actor.username,
      sourceScreen: "supervisor_review",
    },
  });
};

const buildRejectEvent = (lineId: string, options?: ReviewCommandOptions) => {
  const actor = getCurrentActor();
  const rejectedAt = new Date().toISOString();
  const idempotencyKey = generateUUID();
  return createCountLineRejectedEvent({
    id: idempotencyKey,
    payload: {
      line_id: lineId,
      session_id: options?.session_id,
      rejected_at: rejectedAt,
      rejected_by: actor.username,
      notes: options?.notes,
      assign_to: options?.assign_to,
      sync_status: "pending",
    },
    meta: {
      idempotencyKey,
      createdBy: actor.username,
      sourceScreen: "supervisor_review",
    },
  });
};

const buildVerifyEvent = (lineId: string, options?: ReviewCommandOptions) => {
  const actor = getCurrentActor();
  const verifiedAt = new Date().toISOString();
  const idempotencyKey = generateUUID();
  return createStockVerifiedEvent({
    id: idempotencyKey,
    payload: {
      line_id: lineId,
      session_id: options?.session_id,
      verified_at: verifiedAt,
      verified_by: actor.username,
      sync_status: "pending",
    },
    meta: {
      idempotencyKey,
      createdBy: actor.username,
      sourceScreen: "supervisor_review",
    },
  });
};

const buildUnverifyEvent = (lineId: string, options?: ReviewCommandOptions) => {
  const actor = getCurrentActor();
  const unverifiedAt = new Date().toISOString();
  const idempotencyKey = generateUUID();
  return createStockUnverifiedEvent({
    id: idempotencyKey,
    payload: {
      line_id: lineId,
      session_id: options?.session_id,
      unverified_at: unverifiedAt,
      unverified_by: actor.username,
      sync_status: "pending",
    },
    meta: {
      idempotencyKey,
      createdBy: actor.username,
      sourceScreen: "supervisor_review",
    },
  });
};

const syncReviewEvent = async (event: CountLineReviewEvent): Promise<any> => {
  const serverLineId = await extractServerLineId(event.aggregateId);
  if (!serverLineId) {
    throw new Error("Pending count line must sync before dependent review actions.");
  }

  if (event.type === "COUNT_LINE_APPROVED") {
    const response = await api.put(
      `/api/count-lines/${serverLineId}/approve`,
      event.payload.notes ? { notes: event.payload.notes } : {},
      {
        skipOfflineQueue: true,
        headers: { "X-Idempotency-Key": event.meta.idempotencyKey },
      } as any
    );
    await markCountLineReviewEventSynced(event.id);
    return response.data;
  }

  if (event.type === "COUNT_LINE_REJECTED") {
    const response = await api.put(
      `/api/count-lines/${serverLineId}/reject`,
      {
        notes: event.payload.notes,
        assign_to: event.payload.assign_to,
      },
      {
        skipOfflineQueue: true,
        headers: { "X-Idempotency-Key": event.meta.idempotencyKey },
      } as any
    );
    await markCountLineReviewEventSynced(event.id);
    return response.data;
  }

  if (event.type === "STOCK_VERIFIED") {
    const response = await api.put(`/api/count-lines/${serverLineId}/verify`, {}, {
      skipOfflineQueue: true,
      headers: { "X-Idempotency-Key": event.meta.idempotencyKey },
    } as any);
    await markCountLineReviewEventSynced(event.id);
    return response.data;
  }

  const response = await api.put(`/api/count-lines/${serverLineId}/unverify`, {}, {
    skipOfflineQueue: true,
    headers: { "X-Idempotency-Key": event.meta.idempotencyKey },
  } as any);
  await markCountLineReviewEventSynced(event.id);
  return response.data;
};

const recordAndMaybeSync = async (
  event: CountLineReviewEvent,
  fallbackMessage: string
): Promise<any> => {
  await recordCountLineReviewEvent(event);
  controlPlaneEventBus.publish("review.changed", {
    lineId: event.aggregateId,
    sessionId: event.payload.session_id ?? undefined,
    localEventId: event.id,
    reason: "recorded",
  });

  if (!isOnline()) {
    return {
      success: true,
      _offline: true,
      _controlPlane: true,
      _local_event_id: event.id,
    };
  }

  try {
    const response = await syncReviewEvent(event);
    incrementControlPlaneMetric("sync_success_count");
    controlPlaneEventBus.publish("review.changed", {
      lineId: event.aggregateId,
      sessionId: event.payload.session_id ?? undefined,
      localEventId: event.id,
      reason: "synced",
    });
    return {
      ...response,
      _controlPlane: true,
      _local_event_id: event.id,
    };
  } catch (error) {
    const errorMessage = buildReviewError(fallbackMessage, error);
    if (isServerValidationError(error)) {
      await markCountLineReviewEventFailed(event.id, errorMessage);
      await rebuildCountLineReviewProjections();
      incrementControlPlaneMetric("sync_failure_count");
      controlPlaneEventBus.publish("review.changed", {
        lineId: event.aggregateId,
        sessionId: event.payload.session_id ?? undefined,
        localEventId: event.id,
        reason: "failed",
      });
      throw error;
    }

    await markCountLineReviewEventRetry(event.id, errorMessage);
    incrementControlPlaneMetric("sync_retry_count");
    controlPlaneEventBus.publish("review.changed", {
      lineId: event.aggregateId,
      sessionId: event.payload.session_id ?? undefined,
      localEventId: event.id,
      reason: "retry",
    });

    return {
      success: true,
      _offline: true,
      _degraded: true,
      _controlPlane: true,
      _local_event_id: event.id,
    };
  }
};

const toLineLookupId = (line: Record<string, unknown>): string | null => {
  const candidate = line.count_line_id || line.id || line._id;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
};

export const overlayCountLineReviewState = async <T extends Record<string, any>>(
  rows: T[]
): Promise<T[]> => {
  if (!controlPlaneFlags.enableProjectionReads || rows.length === 0) {
    return rows;
  }

  const lineIds = rows.map(toLineLookupId).filter((value): value is string => Boolean(value));
  if (lineIds.length === 0) {
    return rows;
  }

  const projectedStates = await getProjectedCountLineReviewStates(lineIds);
  if (projectedStates.length === 0) {
    return rows;
  }

  const byLineId = new Map(projectedStates.map((state) => [state.lineId, state]));

  return rows.map((row) => {
    const lineId = toLineLookupId(row);
    if (!lineId) {
      return row;
    }

    const projected = byLineId.get(lineId);
    if (!projected) {
      return row;
    }

    return {
      ...row,
      status: projected.status ?? row.status,
      approval_status: projected.approvalStatus ?? row.approval_status,
      approved_by: projected.approvedBy ?? row.approved_by,
      approved_at: projected.approvedAt ?? row.approved_at,
      approval_note: projected.approvalNote ?? row.approval_note,
      rejected_by: projected.rejectedBy ?? row.rejected_by,
      rejected_at: projected.rejectedAt ?? row.rejected_at,
      rejection_reason: projected.rejectionReason ?? row.rejection_reason,
      assigned_to: projected.assignedTo ?? row.assigned_to,
      verified: projected.verified === null ? row.verified : projected.verified,
      verified_by: projected.verifiedBy ?? row.verified_by,
      verified_at: projected.verifiedAt ?? row.verified_at,
      blind_recount_required: projected.blindRecountRequired || Boolean(row.blind_recount_required),
      dual_verification_required:
        projected.dualVerificationRequired || Boolean(row.dual_verification_required),
      original_count_hidden: projected.originalCountHidden || Boolean(row.original_count_hidden),
      _sync_status: projected.syncStatus,
      _review_projection: true,
    };
  });
};

export const approveCountLineCommand = async (lineId: string, options?: ReviewCommandOptions) => {
  if (!controlPlaneFlags.enableEventDrivenCountLineReviews) {
    const response = await api.put(
      `/api/count-lines/${lineId}/approve`,
      options?.notes ? { notes: options.notes } : {}
    );
    return response.data;
  }

  return recordAndMaybeSync(buildApproveEvent(lineId, options), "Failed to approve count line");
};

export const rejectCountLineCommand = async (lineId: string, options?: ReviewCommandOptions) => {
  if (!controlPlaneFlags.enableEventDrivenCountLineReviews) {
    const response = await api.put(`/api/count-lines/${lineId}/reject`, {
      notes: options?.notes,
      assign_to: options?.assign_to,
    });
    return response.data;
  }

  return recordAndMaybeSync(buildRejectEvent(lineId, options), "Failed to reject count line");
};

export const verifyStockCommand = async (lineId: string, options?: ReviewCommandOptions) => {
  if (!controlPlaneFlags.enableEventDrivenCountLineReviews) {
    const response = await api.put(`/api/count-lines/${lineId}/verify`);
    return response.data;
  }

  return recordAndMaybeSync(buildVerifyEvent(lineId, options), "Failed to verify stock");
};

export const unverifyStockCommand = async (lineId: string, options?: ReviewCommandOptions) => {
  if (!controlPlaneFlags.enableEventDrivenCountLineReviews) {
    const response = await api.put(`/api/count-lines/${lineId}/unverify`);
    return response.data;
  }

  return recordAndMaybeSync(
    buildUnverifyEvent(lineId, options),
    "Failed to remove stock verification"
  );
};

export const syncPendingCountLineReviewEvents = async (): Promise<{
  success: number;
  failed: number;
  total: number;
  errors: { id: string; error: string }[];
}> => {
  if (!controlPlaneFlags.enableEventDrivenCountLineReviews) {
    return { success: 0, failed: 0, total: 0, errors: [] };
  }

  const events = await getPendingCountLineReviewEvents();
  if (events.length === 0) {
    return { success: 0, failed: 0, total: 0, errors: [] };
  }

  let success = 0;
  let failed = 0;
  const errors: { id: string; error: string }[] = [];

  for (const event of events) {
    try {
      await syncReviewEvent(event);
      success += 1;
      incrementControlPlaneMetric("sync_success_count");
      controlPlaneEventBus.publish("review.changed", {
        lineId: event.aggregateId,
        sessionId: event.payload.session_id ?? undefined,
        localEventId: event.id,
        reason: "synced",
      });
    } catch (error) {
      const errorMessage = buildReviewError("Failed to sync review event", error);
      if (isServerValidationError(error)) {
        await markCountLineReviewEventFailed(event.id, errorMessage);
        await rebuildCountLineReviewProjections();
        failed += 1;
        errors.push({ id: event.id, error: errorMessage });
        incrementControlPlaneMetric("sync_failure_count");
        controlPlaneEventBus.publish("review.changed", {
          lineId: event.aggregateId,
          sessionId: event.payload.session_id ?? undefined,
          localEventId: event.id,
          reason: "failed",
        });
        continue;
      }

      await markCountLineReviewEventRetry(event.id, errorMessage);
      failed += 1;
      errors.push({ id: event.id, error: errorMessage });
      incrementControlPlaneMetric("sync_retry_count");
      controlPlaneEventBus.publish("review.changed", {
        lineId: event.aggregateId,
        sessionId: event.payload.session_id ?? undefined,
        localEventId: event.id,
        reason: "retry",
      });
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
