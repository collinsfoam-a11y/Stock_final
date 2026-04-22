import {
  getOfflineQueue,
  removeManyFromOfflineQueue,
  updateQueueItemRetries,
  updateOfflineQueueItem,
  getCacheStats,
  OfflineQueueItem,
  removeSessionFromCache,
} from "./offline/offlineStorage";
import { syncBatch, isOnline } from "./api/api";
import { useNetworkStore } from "../store/networkStore";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";
import { createLogger } from "./logging";

const log = createLogger("syncService");

const MANUAL_REVIEW_RETRIES_THRESHOLD = 5;

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
const EMPTY_SYNC_RESULT: SyncResult = { success: 0, failed: 0, total: 0, errors: [] };

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

const toSyncOperations = (batch: OfflineQueueItem[]) =>
  batch.map((item: OfflineQueueItem) => ({
    id: item.id,
    type: item.type,
    data: item.data,
    timestamp: item.timestamp,
  }));

const toErrorMessage = (error: unknown, fallback = "Unknown batch error") =>
  error instanceof Error ? error.message : fallback;

const shouldRetryAfterAuth = (error: unknown) =>
  (error as { response?: { status?: number } })?.response?.status === 401;

const removeSyncedSessionsFromCache = async (
  batch: OfflineQueueItem[],
  successIds: string[],
) => {
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
  results: { success: boolean; id: string; message?: string }[],
) => {
  const queueItemsById = new Map(batch.map((item) => [item.id, item]));
  const successIds: string[] = [];
  const errors: { id: string; error: string }[] = [];
  const retryUpdates: Promise<unknown>[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (const result of results) {
    if (result.success) {
      successIds.push(result.id);
      successCount += 1;
      continue;
    }

    failedCount += 1;
    const errorMessage = result.message || "Unknown error";
    errors.push({ id: result.id, error: errorMessage });
    log.warn(`Sync item failed: ${result.id} - ${errorMessage}`);
    const queueItem = queueItemsById.get(result.id);
    const nextRetryCount = (queueItem?.retries || 0) + 1;
    retryUpdates.push(
      updateQueueItemRetries(result.id, {
        error: errorMessage,
        status: deriveFailureStatus(errorMessage, nextRetryCount),
        attemptedAt: new Date().toISOString(),
      }),
    );
  }

  if (retryUpdates.length > 0) {
    await Promise.all(retryUpdates);
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
        updateOfflineQueueItem(item.id, {
        status: "pending_retry",
        last_error: errorMessage,
        last_attempted_at: new Date().toISOString(),
        }),
      ),
    );
    return {
      failedCount: batch.length,
      errors: batch.map((item) => ({ id: item.id, error: errorMessage })),
    };
  }

  log.error(`Batch sync failed: ${errorMessage}`, batchError as Record<string, unknown>);
  await Promise.all(
    batch.map((item) => {
      const nextRetryCount = item.retries + 1;
      return updateQueueItemRetries(item.id, {
        error: errorMessage,
        status: deriveFailureStatus(errorMessage, nextRetryCount),
        attemptedAt: new Date().toISOString(),
      });
    }),
  );

  return {
    failedCount: batch.length,
    errors: batch.map((item) => ({ id: item.id, error: errorMessage })),
  };
};

const syncBatchChunk = async (batch: OfflineQueueItem[], batchIndex: number) => {
  const operations = toSyncOperations(batch);
  log.debug(`Processing batch ${batchIndex + 1}`, {
    batchSize: batch.length,
    operations: operations.map((operation: Record<string, unknown>) => ({
      id: operation.id,
      type: operation.type,
    })),
  });

  try {
    const response = await syncBatch(operations);
    return await handleBatchResults(batch, response.results || []);
  } catch (error: unknown) {
    const failure = await handleBatchFailure(batch, error);
    return { successCount: 0, ...failure };
  }
};

/**
 * Subscribes to network changes and schedules reconnect sync when allowed.
 */
export const initializeSyncService = () => {
  let networkReady = false;

  const unsubscribe = useNetworkStore.subscribe((state) => {
    const wasOnline = networkReady;
    networkReady = state.isOnline;

    if (state.isOnline && !wasOnline) {
      const settings = useSettingsStore.getState().settings;
      if (
        settings.offlineMode ||
        !settings.autoSyncEnabled ||
        !settings.syncOnReconnect
      ) {
        log.debug("Reconnect sync disabled by user settings");
        return;
      }

      log.debug("Network came online, scheduling sync");

      setTimeout(() => {
        const authState = useAuthStore.getState();
        if (authState.isAuthenticated && authState.user) {
          log.debug("Authenticated and online, triggering sync");
          syncOfflineQueue({ background: true });
        } else {
          log.debug("Not authenticated yet, skipping sync until login");
        }
      }, 2000);
    }
  });

  return {
    cleanup: () => {
      unsubscribe();
    },
  };
};

/**
 * Returns the current online state and offline queue summary.
 */
export const getSyncStatus = async () => {
  const stats = await getCacheStats();
  const online = useNetworkStore.getState().isOnline;

  return {
    isOnline: online,
    queuedOperations: stats.queuedOperations,
    lastSync: stats.lastSync,
    cacheSize: stats.cacheSizeKB,
    needsSync: stats.queuedOperations > 0,
  };
};

/**
 * Flushes queued offline operations in batches when auth and connectivity allow it.
 */
export const syncOfflineQueue = async (
  options?: SyncOptions,
): Promise<SyncResult> => {
  const skipped = shouldSkipSync(options);
  if (skipped) return skipped;

  isSyncing = true;

  try {
    const queue = await getOfflineQueue();
    if (queue.length === 0) {
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

    log.info(
      `Sync complete: ${successCount} succeeded, ${failedCount} failed`,
      {
        total,
        successCount,
        failedCount,
        errorCount: errors.length,
      },
    );

    return {
      success: successCount,
      failed: failedCount,
      total,
      errors,
    };
  } catch (error: unknown) {
    log.error("Sync process error", error as Record<string, unknown>);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown sync error";
    return {
      success: 0,
      failed: 0,
      total: 0,
      errors: [{ id: "general", error: errorMessage }],
    };
  } finally {
    isSyncing = false;
  }
};

/**
 * Forces an explicit sync attempt using the standard offline queue flow.
 */
export const forceSync = async (options?: SyncOptions): Promise<SyncResult> => {
  return syncOfflineQueue(options);
};
