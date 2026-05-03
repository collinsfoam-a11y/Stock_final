import {
  appendReplayAuditEntry,
  getOfflineQueue,
  removeManyFromOfflineQueue,
  updateQueueItemRetries,
  updateOfflineQueueItem,
  getCacheStats,
  OfflineQueueItem,
  cacheSession,
  getMappedSessionId,
  removeSessionFromCache,
  setSessionIdMapping,
} from "./offline/offlineStorage";
import { syncBatch, isOnline } from "./api/api";
import apiClient from "@/api/client";
import {
  getConnectivityState,
  setSyncReplayInProgress,
} from "../core/connectivityState";
import { getWritePolicyMetrics } from "../core/writePolicyMetrics";
import { useNetworkStore } from "../store/networkStore";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";
import { createLogger } from "./logging";
import { normalizeCountLineState } from "@/contracts/states";
import type { SyncRecord, SyncResult as ApiSyncResult } from "../types/sync";

const log = createLogger("syncService");

const MANUAL_REVIEW_RETRIES_THRESHOLD = 3;

/**
 * Aggregate outcome returned after syncing the offline queue.
 */
export interface SyncResult {
  success: number;
  failed: number;
  total: number;
  errors: { id: string; error: string }[];
}

/**
 * Optional callbacks and flags that shape a sync run.
 */
export interface SyncOptions {
  onProgress?: (current: number, total: number) => void;
  background?: boolean;
}

// Simple in-memory lock to prevent concurrent syncs
let isSyncing = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let activeSyncCleanup: (() => void) | null = null;
const EMPTY_SYNC_RESULT: SyncResult = { success: 0, failed: 0, total: 0, errors: [] };
type ReplayRunSummary = {
  timestamp: string;
  connectivityState: string;
  success: number;
  failed: number;
  total: number;
  errorCount: number;
};
let lastReplayRunSummary: ReplayRunSummary | null = null;

const clearReconnectTimer = () => {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const deriveFailureStatus = (
  errorMessage: string,
  nextRetryCount: number
): OfflineQueueItem["status"] => {
  const normalized = errorMessage.toLowerCase();
  if (
    normalized.includes("duplicate") ||
    normalized.includes("conflict") ||
    normalized.includes("already been counted")
  ) {
    return "blocked_conflict";
  }

  if (nextRetryCount >= MANUAL_REVIEW_RETRIES_THRESHOLD) {
    return "failed_manual_review";
  }

  return "pending_retry";
};

const shouldSkipSync = (options?: SyncOptions): SyncResult | null => {
  if (isSyncing) {
    log.debug("Sync already in progress, skipping");
    return EMPTY_SYNC_RESULT;
  }

  if (!isOnline()) {
    log.debug("Offline, skipping sync");
    return EMPTY_SYNC_RESULT;
  }

  const settings = useSettingsStore.getState().settings;
  if (options?.background && (settings.offlineMode || !settings.autoSyncEnabled)) {
    log.debug("Background sync disabled by user settings");
    return EMPTY_SYNC_RESULT;
  }

  const authState = useAuthStore.getState();
  if (!authState.isAuthenticated || !authState.user) {
    log.debug("Not authenticated, skipping sync");
    return EMPTY_SYNC_RESULT;
  }

  return null;
};

const updateReplayRunSummary = (summary: Omit<ReplayRunSummary, "timestamp">) => {
  lastReplayRunSummary = {
    timestamp: new Date().toISOString(),
    ...summary,
  };
};

const recordReplayAudit = async (
  actionId: string,
  success: boolean,
  retryCount: number,
  error?: string
) => {
  try {
    await appendReplayAuditEntry({
      action_id: actionId,
      success,
      retry_count: retryCount,
      error: error || null,
    });
  } catch (auditError) {
    log.warn("Failed to persist replay audit entry", {
      actionId,
      success,
      retryCount,
      error: auditError instanceof Error ? auditError.message : String(auditError),
    });
  }
};

const stringValue = (value: unknown): string | undefined => {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const normalized = String(value).trim();
  return normalized || undefined;
};

const numberValue = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const dateValue = (value: unknown, fallback: string): string => {
  const normalized = stringValue(value);
  if (!normalized) return fallback;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
};

const listValue = (value: unknown): string[] => {
  if (typeof value === "string" || typeof value === "number") {
    const normalized = stringValue(value);
    return normalized ? [normalized] : [];
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string" || typeof entry === "number") {
        return String(entry);
      }
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        return stringValue(
          record.url || record.uri || record.base64 || record.id || record.serial_number
        );
      }
      return undefined;
    })
    .filter((entry): entry is string => !!entry);
};

const getNestedString = (data: Record<string, unknown>, objectKey: string, fieldKey: string) => {
  const nested = data[objectKey];
  if (!nested || typeof nested !== "object") {
    return undefined;
  }
  return stringValue((nested as Record<string, unknown>)[fieldKey]);
};

const resolveMappedSessionId = async (rawSessionId: unknown): Promise<string | undefined> => {
  const sessionId = stringValue(rawSessionId);
  if (!sessionId) return undefined;
  const mapped = await getMappedSessionId(sessionId);
  return mapped || sessionId;
};

const resolveLocationContext = (data: Record<string, unknown>) => {
  const floorId = stringValue(data.floor_id || data.floor_no);
  const rackId = stringValue(data.rack_id || data.rack_no || data.rack);
  const locationId = stringValue(data.location_id || data.mark_location);

  if (!locationId || !floorId || !rackId) {
    throw new Error("Missing location_id, floor_id, or rack_id for records-based sync");
  }

  return { locationId, floorId, rackId };
};

const buildCountLineRecord = async (item: OfflineQueueItem): Promise<SyncRecord> => {
  const data = item.data || {};
  const sessionId = await resolveMappedSessionId(data.session_id || data.sessionId);
  const itemCode = stringValue(data.item_code || data.itemCode);
  if (!sessionId || !itemCode) {
    throw new Error("Missing session_id or item_code for count-line sync");
  }

  const { locationId, floorId, rackId } = resolveLocationContext(data);
  const now = new Date().toISOString();
  const createdAt = dateValue(
    data.counted_at ||
      data.created_at ||
      data.createdAt ||
      getNestedString(data, "audit", "offline_created_at") ||
      item.timestamp,
    now
  );

  const normalizedState = normalizeCountLineState(data.status || item.status);
  if (normalizedState === "UNKNOWN") {
    throw new Error(`Unsupported offline count-line status: ${String(data.status || "")}`);
  }

  return {
    event_id: item.event_id || item.id,
    record_id: item.id,
    client_record_id: item.id,
    schema_version: "v1",
    session_id: sessionId,
    location_id: locationId,
    floor_id: floorId,
    rack_id: rackId,
    floor: stringValue(data.floor || data.floor_no || data.floor_id) || null,
    item_code: itemCode,
    verified_qty: numberValue(data.verified_qty ?? data.counted_qty),
    damaged_qty: numberValue(data.damaged_qty),
    serial_numbers: listValue(data.serial_numbers || data.serial_entries),
    mfg_date:
      stringValue(data.mfg_date || data.manufacturing_date || data.manufacturingDate) || null,
    mrp:
      data.mrp_counted !== undefined
        ? numberValue(data.mrp_counted)
        : data.mrp !== undefined
          ? numberValue(data.mrp)
          : null,
    uom: stringValue(data.uom || data.uom_name || data.uom_code) || null,
    category: stringValue(data.category || data.category_correction) || null,
    subcategory: stringValue(data.subcategory || data.subcategory_correction) || null,
    item_condition: stringValue(data.item_condition || data.condition) || null,
    evidence_photos: listValue(data.evidence_photos || data.photo_proofs || data.photo_base64),
    status: normalizedState,
    created_at: createdAt,
    updated_at: dateValue(data.updated_at || data.updatedAt || createdAt, createdAt),
    retry_count: Math.max(Number(item.retries || 0), 0),
  };
};

const normalizeSessionPayload = (data: Record<string, unknown>) => {
  const offlineId = stringValue(
    data.client_session_id || data.offline_id || data.id || data.session_id
  );
  const warehouse = stringValue(data.warehouse);
  if (!offlineId || !warehouse) {
    throw new Error("Missing offline session id or warehouse for session sync");
  }

  return {
    offlineId,
    payload: {
      warehouse,
      type: stringValue(data.type) || "STANDARD",
      location_type: stringValue(data.location_type),
      location_name: stringValue(data.location_name),
      rack_no: stringValue(data.rack_no),
      client_session_id: offlineId,
      offline_id: offlineId,
    },
  };
};

const normalizeUnknownItemPayload = async (data: Record<string, unknown>) => {
  const sessionId = await resolveMappedSessionId(data.session_id || data.sessionId);
  if (!sessionId) {
    throw new Error("Missing session_id for unknown-item sync");
  }

  const { locationId, floorId, rackId } = resolveLocationContext(data);
  return {
    ...data,
    session_id: sessionId,
    location_id: locationId,
    floor_id: floorId,
    rack_id: rackId,
    floor_no: stringValue(data.floor_no || data.floor || floorId),
    rack_no: stringValue(data.rack_no || data.rack || rackId),
  };
};

const toErrorMessage = (error: unknown, fallback = "Unknown batch error") => {
  const payload = (error as { response?: { data?: any } })?.response?.data;
  const detail = payload?.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (detail && typeof detail === "object") {
    if (typeof detail.message === "string" && detail.message.trim()) {
      return detail.message;
    }
    if (Array.isArray(detail.conflicts) && detail.conflicts.length > 0) {
      const firstConflict = detail.conflicts[0];
      if (typeof firstConflict?.message === "string" && firstConflict.message.trim()) {
        return firstConflict.message;
      }
    }
    if (typeof detail.error === "string" && detail.error.trim()) {
      return detail.error;
    }
  }
  return error instanceof Error ? error.message : fallback;
};

const resultFromError = (id: string, error: unknown): ApiSyncResult => ({
  id,
  success: false,
  message: toErrorMessage(error),
});

const shouldRetryAfterAuth = (error: unknown) =>
  (error as { response?: { status?: number } })?.response?.status === 401;

const removeSyncedSessionsFromCache = async (batch: OfflineQueueItem[], successIds: string[]) => {
  const successSet = new Set(successIds);
  for (const item of batch) {
    if (!successSet.has(item.id) || item.type !== "session") {
      continue;
    }

    const data = item.data as Record<string, unknown> | undefined;
    if (!data || "operation" in data) {
      continue;
    }

    const offlineId = data.id || data.session_id;
    if (typeof offlineId === "string") {
      await removeSessionFromCache(offlineId);
      log.debug("Removed synced offline session from cache", {
        sessionId: offlineId,
      });
    }
  }
};

const handleBatchResults = async (
  batch: OfflineQueueItem[],
  results: { success: boolean; id: string; message?: string }[]
) => {
  const queueItemsById = new Map(batch.map((item) => [item.id, item]));
  const successIds: string[] = [];
  const errors: { id: string; error: string }[] = [];
  const retryUpdates: Promise<unknown>[] = [];
  const auditUpdates: Promise<unknown>[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (const result of results) {
    const queueItem = queueItemsById.get(result.id);

    if (result.success) {
      successIds.push(result.id);
      successCount += 1;
      auditUpdates.push(recordReplayAudit(result.id, true, queueItem?.retries || 0));
      continue;
    }

    failedCount += 1;
    const errorMessage = result.message || "Unknown error";
    errors.push({ id: result.id, error: errorMessage });
    log.warn(`Sync item failed: ${result.id} - ${errorMessage}`);
    const nextRetryCount = (queueItem?.retries || 0) + 1;
    retryUpdates.push(
      updateQueueItemRetries(result.id, {
        error: errorMessage,
        status: deriveFailureStatus(errorMessage, nextRetryCount),
        attemptedAt: new Date().toISOString(),
      })
    );
    auditUpdates.push(recordReplayAudit(result.id, false, nextRetryCount, errorMessage));
  }

  if (retryUpdates.length > 0) {
    await Promise.all(retryUpdates);
  }
  if (auditUpdates.length > 0) {
    await Promise.all(auditUpdates);
  }

  if (successIds.length > 0) {
    await removeManyFromOfflineQueue(successIds);
    log.debug(`Removed ${successIds.length} synced items from queue`);
    await removeSyncedSessionsFromCache(batch, successIds);
  }

  return { successCount, failedCount, errors };
};

const handleBatchFailure = async (batch: OfflineQueueItem[], batchError: unknown) => {
  const errorMessage = toErrorMessage(batchError);

  if (shouldRetryAfterAuth(batchError)) {
    log.warn("Auth error during sync - will retry after re-authentication");
    await Promise.all(
      batch.map((item) =>
        recordReplayAudit(item.id, false, item.retries + 1, errorMessage)
      )
    );
    await Promise.all(
      batch.map((item) =>
        updateOfflineQueueItem(item.id, {
          status: "pending_retry",
          last_error: errorMessage,
          last_attempted_at: new Date().toISOString(),
        })
      )
    );
    return {
      failedCount: batch.length,
      errors: batch.map((item) => ({ id: item.id, error: errorMessage })),
    };
  }

  log.error(`Batch sync failed: ${errorMessage}`, batchError as Record<string, unknown>);
  await Promise.all(
    batch.map((item) => recordReplayAudit(item.id, false, item.retries + 1, errorMessage))
  );
  await Promise.all(
    batch.map((item) => {
      const nextRetryCount = item.retries + 1;
      return updateQueueItemRetries(item.id, {
        error: errorMessage,
        status: deriveFailureStatus(errorMessage, nextRetryCount),
        attemptedAt: new Date().toISOString(),
      });
    })
  );

  return {
    failedCount: batch.length,
    errors: batch.map((item) => ({ id: item.id, error: errorMessage })),
  };
};

const syncSessionQueueItem = async (item: OfflineQueueItem): Promise<ApiSyncResult> => {
  try {
    const { offlineId, payload } = normalizeSessionPayload(item.data);
    const existingServerId = await getMappedSessionId(offlineId);
    if (existingServerId) {
      return { id: item.id, success: true };
    }

    const response = await apiClient.post("/api/sessions", payload, {
      timeout: 3000,
      skipOfflineQueue: true,
    } as any);
    const responseData = response.data?.data ?? response.data;
    const serverSessionId = stringValue(responseData?.id || responseData?.session_id);
    if (!serverSessionId) {
      throw new Error("Session sync response did not include a session id");
    }

    await setSessionIdMapping(offlineId, serverSessionId);
    await cacheSession(responseData);
    return { id: item.id, success: true };
  } catch (error) {
    return resultFromError(item.id, error);
  }
};

const syncUnknownItemQueueItem = async (item: OfflineQueueItem): Promise<ApiSyncResult> => {
  try {
    const payload = await normalizeUnknownItemPayload(item.data);
    await apiClient.post("/api/unknown-items", payload, {
      timeout: 3000,
      skipOfflineQueue: true,
    } as any);
    return { id: item.id, success: true };
  } catch (error) {
    return resultFromError(item.id, error);
  }
};

const resultsFromBatchResponse = (
  response: Awaited<ReturnType<typeof syncBatch>>
): ApiSyncResult[] => {
  if (Array.isArray(response.results) && response.results.length > 0) {
    return response.results;
  }

  const okResults = (response.ok || []).map((id) => ({ id, success: true }));
  const conflictResults = (response.conflicts || []).map((conflict) => ({
    id: conflict.client_record_id,
    success: false,
    message: conflict.message,
  }));
  const errorResults = (response.errors || []).map((error) => ({
    id: error.client_record_id,
    success: false,
    message: error.message,
  }));
  return [...okResults, ...conflictResults, ...errorResults];
};

const syncBatchChunk = async (batch: OfflineQueueItem[], batchIndex: number) => {
  log.debug(`Processing batch ${batchIndex + 1}`, {
    batchSize: batch.length,
    items: batch.map((item) => ({
      id: item.id,
      type: item.type,
    })),
  });

  const directResults: ApiSyncResult[] = [];
  const countLineItems: OfflineQueueItem[] = [];
  const records: SyncRecord[] = [];

  for (const item of batch.filter((entry) => entry.type === "session")) {
    directResults.push(await syncSessionQueueItem(item));
  }

  for (const item of batch) {
    if (item.type === "session") {
      continue;
    }
    if (item.type === "unknown_item") {
      directResults.push(await syncUnknownItemQueueItem(item));
      continue;
    }

    try {
      records.push(await buildCountLineRecord(item));
      countLineItems.push(item);
    } catch (error) {
      directResults.push(resultFromError(item.id, error));
    }
  }

  if (records.length === 0) {
    return await handleBatchResults(batch, directResults);
  }

  try {
    const response = await syncBatch(records);
    return await handleBatchResults(batch, [
      ...directResults,
      ...resultsFromBatchResponse(response),
    ]);
  } catch (error: unknown) {
    const directOutcome = await handleBatchResults(batch, directResults);
    const failure = await handleBatchFailure(countLineItems, error);
    return {
      successCount: directOutcome.successCount,
      failedCount: directOutcome.failedCount + failure.failedCount,
      errors: [...directOutcome.errors, ...failure.errors],
    };
  }
};

/**
 * Subscribes to network changes and schedules reconnect sync when allowed.
 */
export const initializeSyncService = () => {
  if (activeSyncCleanup) {
    return {
      cleanup: activeSyncCleanup,
    };
  }

  let networkReady = useNetworkStore.getState().isOnline;
  let lastConnectivityState = getConnectivityState();

  const unsubscribe = useNetworkStore.subscribe((state) => {
    const wasOnline = networkReady;
    networkReady = state.isOnline;
    const currentConnectivityState = getConnectivityState();

    if (currentConnectivityState !== lastConnectivityState) {
      log.info("Connectivity transition observed by sync service", {
        from: lastConnectivityState,
        to: currentConnectivityState,
      });
      lastConnectivityState = currentConnectivityState;
    }

    if (state.isOnline && !wasOnline) {
      const settings = useSettingsStore.getState().settings;
      if (settings.offlineMode || !settings.autoSyncEnabled || !settings.syncOnReconnect) {
        log.debug("Reconnect sync disabled by user settings");
        return;
      }

      log.debug("Network came online, scheduling sync");

      clearReconnectTimer();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        const authState = useAuthStore.getState();
        if (authState.isAuthenticated && authState.user) {
          log.debug("Authenticated and online, triggering sync");
          void syncOfflineQueue({ background: true });
        } else {
          log.debug("Not authenticated yet, skipping sync until login");
        }
      }, 2000);
    }
  });

  activeSyncCleanup = () => {
    clearReconnectTimer();
    unsubscribe();
    activeSyncCleanup = null;
  };

  return {
    cleanup: activeSyncCleanup,
  };
};

/**
 * Returns the current online state and offline queue summary.
 */
export const getSyncStatus = async () => {
  const [stats, writePolicyMetrics] = await Promise.all([
    getCacheStats(),
    getWritePolicyMetrics(),
  ]);
  const online = useNetworkStore.getState().isOnline;
  const connectivityState = getConnectivityState();
  const totalWriteDecisions = writePolicyMetrics.directWrites + writePolicyMetrics.queuedWrites;
  const offlineUsagePercent =
    totalWriteDecisions > 0
      ? (writePolicyMetrics.queuedWrites / totalWriteDecisions) * 100
      : 0;

  return {
    isOnline: online,
    connectivityState,
    queuedOperations: stats.queuedOperations,
    replaySuccessRate: stats.replaySuccessRate,
    replaySuccessCount: stats.replaySuccessCount,
    replayFailureCount: stats.replayFailureCount,
    writePolicyMetrics,
    offlineUsagePercent,
    lastSync: stats.lastSync,
    lastReplayAudit: stats.lastReplayAudit || null,
    lastReplayRun: lastReplayRunSummary,
    cacheSize: stats.cacheSizeKB,
    needsSync: stats.queuedOperations > 0,
  };
};

/**
 * Flushes queued offline operations in batches when auth and connectivity allow it.
 */
export const syncOfflineQueue = async (options?: SyncOptions): Promise<SyncResult> => {
  const skipped = shouldSkipSync(options);
  if (skipped) return skipped;

  isSyncing = true;
  setSyncReplayInProgress(true);

  try {
    const queue = (await getOfflineQueue()).filter((item) =>
      item.status === "pending" || item.status === "pending_retry"
    );
    if (queue.length === 0) {
      updateReplayRunSummary({
        connectivityState: getConnectivityState(),
        success: 0,
        failed: 0,
        total: 0,
        errorCount: 0,
      });
      return EMPTY_SYNC_RESULT;
    }

    const total = queue.length;
    log.info(`Syncing ${total} items from offline queue`);

    // Process in batches of 50 to avoid payload size issues
    const BATCH_SIZE = 50;
    let processed = 0;
    let successCount = 0;
    let failedCount = 0;
    const errors: { id: string; error: string }[] = [];

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = queue.slice(i, i + BATCH_SIZE);
      const batchResult = await syncBatchChunk(batch, Math.floor(i / BATCH_SIZE));
      successCount += batchResult.successCount;
      failedCount += batchResult.failedCount;
      errors.push(...batchResult.errors);

      processed += batch.length;
      options?.onProgress?.(processed, total);
    }

    log.info(`Sync complete: ${successCount} succeeded, ${failedCount} failed`, {
      total,
      successCount,
      failedCount,
      errorCount: errors.length,
    });
    updateReplayRunSummary({
      connectivityState: getConnectivityState(),
      success: successCount,
      failed: failedCount,
      total,
      errorCount: errors.length,
    });

    return {
      success: successCount,
      failed: failedCount,
      total,
      errors,
    };
  } catch (error: unknown) {
    log.error("Sync process error", error as Record<string, unknown>);
    const errorMessage = error instanceof Error ? error.message : "Unknown sync error";
    updateReplayRunSummary({
      connectivityState: getConnectivityState(),
      success: 0,
      failed: 0,
      total: 0,
      errorCount: 1,
    });
    return {
      success: 0,
      failed: 0,
      total: 0,
      errors: [{ id: "general", error: errorMessage }],
    };
  } finally {
    isSyncing = false;
    setSyncReplayInProgress(false);
  }
};

export const getLastReplayRunSummary = () => lastReplayRunSummary;

/**
 * Forces an explicit sync attempt using the standard offline queue flow.
 */
export const forceSync = async (options?: SyncOptions): Promise<SyncResult> => {
  return syncOfflineQueue(options);
};
