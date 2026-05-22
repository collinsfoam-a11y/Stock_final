import api from "@/services/httpClient";
import { useAuthStore } from "@/store/authStore";
import { generateUUID } from "@/utils/uuid";
import type { CreateCountLinePayload } from "@/types/scan";
import { controlPlaneFlags } from "@/core/config/controlPlaneFlags";
import {
  createCountLineRecordedEvent,
  type CountLineRecordedPayload,
  type InventoryEvent,
} from "@/domain/events/inventoryEvents";
import { enforceCountLinePolicies } from "@/domain/policies/inventoryPolicies";
import {
  bindInventoryServerLineId,
  getPendingInventoryEvents,
  getProjectedCountLinesBySessionIds,
  getProjectedScanStatusBySessionIds,
  getProjectedSessionStatsBySessionIds,
  markInventoryEventFailed,
  markInventoryEventRetry,
  markInventoryEventSynced,
  rebuildInventoryProjections,
  recordInventoryEvent,
} from "@/data/repositories/inventoryControlPlaneRepository";
import {
  resolveLocalSessionId,
  resolveProjectionSessionIds,
  resolveServerSessionId,
} from "@/data/repositories/sessionControlPlaneRepository";
import {
  cacheCountLine,
  getCountLinesBySessionFromCache,
  getItemFromCache,
  removeCountLineFromCache,
} from "@/services/offline/offlineStorage";
import {
  type ControlPlaneMetricName,
  getControlPlaneMetric,
  incrementControlPlaneMetric,
} from "@/services/observability/controlPlaneMetrics";
import { overlayCountLineReviewState } from "@/services/control-plane/countLineReviewControlPlane";
import { controlPlaneEventBus } from "@/services/control-plane/controlPlaneEventBus";
import { rebindCountLineReviewLineId } from "@/data/repositories/countLineReviewControlPlaneRepository";
import { isLocalDbUnavailableError } from "@/db/localDbErrors";

export class ProjectionReadError extends Error {
  code = "MISSING_PROJECTION";

  constructor(message: string) {
    super(message);
    this.name = "ProjectionReadError";
  }
}

const resolveCountLineItemName = async (countData: CreateCountLinePayload): Promise<string> => {
  const trimmedName = countData.item_name?.trim();
  if (
    trimmedName &&
    trimmedName.toLowerCase() !== "unknown item" &&
    trimmedName !== countData.item_code
  ) {
    return trimmedName;
  }

  try {
    const cachedItem = await getItemFromCache(countData.item_code);
    if (cachedItem?.item_name?.trim()) {
      return cachedItem.item_name.trim();
    }
  } catch {
    // Best-effort cache lookup only.
  }

  return countData.item_code;
};

const toCountLinePayload = async (
  payload: CreateCountLinePayload,
  syncStatus: CountLineRecordedPayload["sync_status"]
): Promise<CountLineRecordedPayload> => {
  const username = useAuthStore.getState().user?.username || "offline_user";
  const itemName = await resolveCountLineItemName(payload);
  const idempotencyKey = payload.idempotency_key?.trim() || generateUUID();
  const countedAt = new Date().toISOString();

  return {
    ...payload,
    idempotency_key: idempotencyKey,
    item_name: itemName,
    local_line_id: idempotencyKey,
    counted_at: countedAt,
    counted_by: username,
    sync_status: syncStatus,
  };
};

const buildCountLineEvent = async (
  payload: CreateCountLinePayload,
  syncStatus: CountLineRecordedPayload["sync_status"]
): Promise<InventoryEvent> => {
  const localSessionId = await resolveLocalSessionId(payload.session_id);
  const eventPayload = await toCountLinePayload(
    {
      ...payload,
      session_id: localSessionId,
    },
    syncStatus
  );
  const idempotencyKey = eventPayload.idempotency_key!;

  return createCountLineRecordedEvent({
    id: idempotencyKey,
    payload: eventPayload,
    meta: {
      sessionId: eventPayload.session_id,
      createdBy: eventPayload.counted_by,
      sourceScreen: "scan_screen",
      idempotencyKey,
    },
  });
};

const buildCachedCountLine = (event: InventoryEvent) => {
  if (event.type !== "COUNT_LINE_RECORDED") {
    throw new Error(`Unsupported event type: ${event.type}`);
  }

  return {
    _id: event.id,
    idempotency_key: event.payload.idempotency_key,
    session_id: event.payload.session_id,
    item_code: event.payload.item_code,
    item_name: event.payload.item_name || event.payload.item_code,
    barcode: event.payload.barcode,
    batch_id: event.payload.batch_id,
    batches: event.payload.batches,
    counted_qty: event.payload.counted_qty,
    counted_by: event.payload.counted_by,
    counted_at: event.payload.counted_at,
    floor_no: event.payload.floor_no,
    rack_no: event.payload.rack_no,
    rack: event.payload.rack_no || undefined,
    verified: false,
    cached_at: event.payload.counted_at,
    audit: {
      source: event.meta.sourceScreen || "scan_screen",
      device_id: event.meta.deviceId || null,
      app_version: null,
      created_offline: event.payload.sync_status !== "synced",
      offline_created_at: event.payload.counted_at,
      sync_status: event.payload.sync_status,
      idempotency_key: event.meta.idempotencyKey,
    },
  };
};

const cacheEventProjection = async (event: InventoryEvent): Promise<void> => {
  await cacheCountLine(buildCachedCountLine(event));
};

const mergeProjectedPayload = (
  row: Awaited<ReturnType<typeof getProjectedCountLinesBySessionIds>>[number]
) => {
  const parsedPayload = JSON.parse(row.payload_json) as Record<string, unknown>;
  return {
    ...parsedPayload,
    id: row.server_line_id || row.event_id,
    _id: row.server_line_id || row.event_id,
    _local_event_id: row.event_id,
    session_id: row.session_id,
    item_code: row.item_code,
    item_name: row.item_name,
    counted_qty: row.counted_qty,
    counted_by: row.counted_by,
    counted_at: row.counted_at,
    floor_no: row.floor_no ?? null,
    rack_no: row.rack_no ?? null,
    verified: false,
    _projection: true,
    _sync_status: row.sync_status,
  };
};

const extractServerLineId = (responseData: any): string | null => {
  const candidate =
    responseData?.id ||
    responseData?._id ||
    responseData?.count_line_id ||
    responseData?.data?.id ||
    responseData?.data?._id ||
    null;

  return typeof candidate === "string" && candidate.trim() ? candidate : null;
};

const isServerValidationError = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return typeof status === "number" && status >= 400 && status < 500;
};

const recordProjectionGap = async (metricName: ControlPlaneMetricName): Promise<void> => {
  incrementControlPlaneMetric(metricName);
};

const handleProjectionStorageReadError = async (error: unknown): Promise<null> => {
  if (!isLocalDbUnavailableError(error)) {
    throw error;
  }
  await recordProjectionGap("projection_fallback_count");
  return null;
};

export const submitCountLineCommand = async (countData: CreateCountLinePayload): Promise<any> => {
  if (!controlPlaneFlags.enableEventDrivenCountLines) {
    return api
      .post("/api/count-lines", countData, {
        skipOfflineQueue: true,
      } as any)
      .then((response) => response.data);
  }

  enforceCountLinePolicies(countData);

  const event = await buildCountLineEvent(countData, "pending");
  await recordInventoryEvent(event);
  await cacheEventProjection(event);
  controlPlaneEventBus.publish("inventory.changed", {
    sessionId: event.payload.session_id,
    itemCode: event.payload.item_code,
    localEventId: event.id,
    reason: "recorded",
  });

  const online = (await import("@/services/api/sessionManagementApi")).isOnline();
  const serverSessionId = await resolveServerSessionId(event.payload.session_id);

  if (!online || !serverSessionId) {
    return {
      ...buildCachedCountLine(event),
      _offline: true,
      _source: "local",
      _controlPlane: true,
    };
  }

  try {
    const response = await api.post(
      "/api/count-lines",
      {
        ...event.payload,
        session_id: serverSessionId,
      },
      {
        skipOfflineQueue: true,
        headers: {
          "X-Idempotency-Key": event.meta.idempotencyKey,
        },
      } as any
    );
    await markInventoryEventSynced(event.id);
    const serverLineId = extractServerLineId(response.data);
    await bindInventoryServerLineId(event.id, serverLineId);
    await rebindCountLineReviewLineId(event.id, serverLineId || "");

    const syncedEvent: InventoryEvent = {
      ...event,
      payload: {
        ...event.payload,
        sync_status: "synced",
      },
    };
    await cacheEventProjection(syncedEvent);
    controlPlaneEventBus.publish("inventory.changed", {
      sessionId: event.payload.session_id,
      itemCode: event.payload.item_code,
      localEventId: event.id,
      reason: "synced",
    });

    return {
      ...response.data,
      _source: "api",
      _controlPlane: true,
      _local_event_id: event.id,
    };
  } catch (error) {
    if (isServerValidationError(error)) {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (error instanceof Error ? error.message : "Count line rejected");
      await markInventoryEventFailed(event.id, message);
      await removeCountLineFromCache(event.payload.session_id, event.id);
      await rebuildInventoryProjections();
      incrementControlPlaneMetric("sync_failure_count");
      controlPlaneEventBus.publish("inventory.changed", {
        sessionId: event.payload.session_id,
        itemCode: event.payload.item_code,
        localEventId: event.id,
        reason: "failed",
      });
      throw error;
    }

    await markInventoryEventRetry(
      event.id,
      error instanceof Error ? error.message : "Network error"
    );
    incrementControlPlaneMetric("sync_retry_count");
    controlPlaneEventBus.publish("inventory.changed", {
      sessionId: event.payload.session_id,
      itemCode: event.payload.item_code,
      localEventId: event.id,
      reason: "retry",
    });

    return {
      ...buildCachedCountLine(event),
      _offline: true,
      _source: "local",
      _degraded: true,
      _controlPlane: true,
    };
  }
};

export const syncPendingCountLineEvents = async (): Promise<{
  success: number;
  failed: number;
  total: number;
  errors: { id: string; error: string }[];
}> => {
  if (!controlPlaneFlags.enableEventDrivenCountLines) {
    return { success: 0, failed: 0, total: 0, errors: [] };
  }

  const events = await getPendingInventoryEvents();
  if (events.length === 0) {
    return { success: 0, failed: 0, total: 0, errors: [] };
  }

  const errors: { id: string; error: string }[] = [];
  let success = 0;
  let failed = 0;

  for (const event of events) {
    if (event.type !== "COUNT_LINE_RECORDED") {
      continue;
    }

    try {
      const serverSessionId = await resolveServerSessionId(event.payload.session_id);
      if (!serverSessionId) {
        await markInventoryEventRetry(
          event.id,
          "Pending session start must sync before dependent count lines."
        );
        incrementControlPlaneMetric("sync_retry_count");
        break;
      }

      const response = await api.post(
        "/api/count-lines",
        {
          ...event.payload,
          session_id: serverSessionId,
        },
        {
          skipOfflineQueue: true,
          headers: {
            "X-Idempotency-Key": event.meta.idempotencyKey,
          },
        } as any
      );
      await markInventoryEventSynced(event.id);
      const serverLineId = extractServerLineId(response.data);
      await bindInventoryServerLineId(event.id, serverLineId);
      await rebindCountLineReviewLineId(event.id, serverLineId || "");
      success += 1;
      incrementControlPlaneMetric("sync_success_count");
      controlPlaneEventBus.publish("inventory.changed", {
        sessionId: event.payload.session_id,
        itemCode: event.payload.item_code,
        localEventId: event.id,
        reason: "synced",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to sync count line event";
      if (isServerValidationError(error)) {
        await markInventoryEventFailed(event.id, errorMessage);
        await removeCountLineFromCache(event.payload.session_id, event.id);
        await rebuildInventoryProjections();
        failed += 1;
        errors.push({ id: event.id, error: errorMessage });
        incrementControlPlaneMetric("sync_failure_count");
        controlPlaneEventBus.publish("inventory.changed", {
          sessionId: event.payload.session_id,
          itemCode: event.payload.item_code,
          localEventId: event.id,
          reason: "failed",
        });
        continue;
      }

      await markInventoryEventRetry(event.id, errorMessage);
      failed += 1;
      errors.push({ id: event.id, error: errorMessage });
      incrementControlPlaneMetric("sync_retry_count");
      controlPlaneEventBus.publish("inventory.changed", {
        sessionId: event.payload.session_id,
        itemCode: event.payload.item_code,
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

export const getProjectedCountLinesForSession = async (
  sessionId: string
): Promise<any[] | null> => {
  if (!controlPlaneFlags.enableProjectionReads) {
    return null;
  }

  try {
    const projectionSessionIds = await resolveProjectionSessionIds(sessionId);
    const projected = await getProjectedCountLinesBySessionIds(projectionSessionIds);
    if (projected.length > 0) {
      incrementControlPlaneMetric("projection_read_hit_count");
      return overlayCountLineReviewState(projected.map(mergeProjectedPayload));
    }

    const cachedLines = await getCountLinesBySessionFromCache(projectionSessionIds);
    if (cachedLines.length > 0) {
      await recordProjectionGap("projection_fallback_count");
      if (controlPlaneFlags.strictProjectionReads) {
        incrementControlPlaneMetric("projection_strict_error_count");
        throw new ProjectionReadError(
          `Projection missing for session ${sessionId} while cached count lines exist.`
        );
      }
    }

    return null;
  } catch (error) {
    return handleProjectionStorageReadError(error);
  }
};

export const getProjectedSessionStatsRead = async (
  sessionId: string
): Promise<{
  scannedItems: number;
  pendingItems: number;
  verifiedItems: number;
  lastCountedAt: string | null;
} | null> => {
  if (!controlPlaneFlags.enableProjectionReads) {
    return null;
  }

  try {
    const projectionSessionIds = await resolveProjectionSessionIds(sessionId);
    const projectedStats = await getProjectedSessionStatsBySessionIds(projectionSessionIds);
    if (projectedStats) {
      incrementControlPlaneMetric("projection_read_hit_count");
      return projectedStats;
    }

    const cachedLines = await getCountLinesBySessionFromCache(projectionSessionIds);
    if (cachedLines.length > 0) {
      await recordProjectionGap("projection_fallback_count");
      if (controlPlaneFlags.strictProjectionReads) {
        incrementControlPlaneMetric("projection_strict_error_count");
        throw new ProjectionReadError(
          `Projection missing for session stats ${sessionId} while cached lines exist.`
        );
      }
    }

    return null;
  } catch (error) {
    return handleProjectionStorageReadError(error);
  }
};

export const getProjectedScanStatusRead = async (
  sessionId: string,
  itemCode: string
): Promise<{
  scanned: boolean;
  total_qty: number;
  locations: {
    floor_no: string | null;
    rack_no: string | null;
    counted_qty: number;
    counted_by: string;
    counted_at: string;
  }[];
} | null> => {
  if (!controlPlaneFlags.enableProjectionReads) {
    return null;
  }

  try {
    const projectionSessionIds = await resolveProjectionSessionIds(sessionId);
    const projectedStatus = await getProjectedScanStatusBySessionIds(projectionSessionIds, itemCode);
    if (projectedStatus.scanned) {
      incrementControlPlaneMetric("projection_read_hit_count");
      return projectedStatus;
    }

    const cachedLines = await getCountLinesBySessionFromCache(projectionSessionIds);
    const matchingCached = cachedLines.filter((line) => line.item_code === itemCode);
    if (matchingCached.length > 0) {
      await recordProjectionGap("projection_fallback_count");
      if (controlPlaneFlags.strictProjectionReads) {
        incrementControlPlaneMetric("projection_strict_error_count");
        throw new ProjectionReadError(
          `Projection missing for ${sessionId}/${itemCode} while cached lines exist.`
        );
      }
    }

    return null;
  } catch (error) {
    return handleProjectionStorageReadError(error);
  }
};

export const getControlPlaneReadMetrics = () => ({
  projectionReads: getControlPlaneMetric("projection_read_hit_count"),
  projectionFallbacks: getControlPlaneMetric("projection_fallback_count"),
  strictReadErrors: getControlPlaneMetric("projection_strict_error_count"),
});
