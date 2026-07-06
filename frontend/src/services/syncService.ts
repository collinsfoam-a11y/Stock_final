import {
  getOfflineQueue,
  removeManyFromOfflineQueue,
  updateQueueItemRetries,
  updateOfflineQueueItem,
  getCacheStats,
  OfflineQueueItem,
  removeSessionFromCache,
} from "./offline/offlineStorage";
import { useNetworkStore } from "../store/networkStore";
import { useSettingsStore } from "../store/settingsStore";
import { createLogger } from "./logging";
import { isDefinitelyOnline } from "../utils/network";
import type { SyncRecord } from "../types/sync";

const log = createLogger("syncService");

const MANUAL_REVIEW_RETRIES_THRESHOLD = 5;
const RECONNECT_SYNC_DELAY_MS = 2000;
const DEFAULT_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const IS_TEST_ENV =
  process.env.NODE_ENV === "test" || typeof process.env.JEST_WORKER_ID !== "undefined";
type SyncAuthState = {
  isAuthenticated: boolean;
  user: unknown | null;
};

const emptyAuthState: SyncAuthState = {
  isAuthenticated: false,
  user: null,
};
let authStateProvider: () => SyncAuthState = () => emptyAuthState;
let syncBatchPromise:
  | Promise<(typeof import("./api/api.misc"))["syncBatch"]>
  | null = null;
let periodicSyncInterval: ReturnType<typeof setInterval> | null = null;
let periodicSettingsUnsubscribe: (() => void) | null = null;
let periodicSyncIntervalOverrideMs: number | undefined;

const getSyncBatch = async () => {
  if (!syncBatchPromise) {
    syncBatchPromise = IS_TEST_ENV
      ? Promise.resolve(
          // Jest `doMock` setups need synchronous resolution after mocks are registered.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("./api/api.misc")
            .syncBatch as (typeof import("./api/api.misc"))["syncBatch"],
        )
      : import("./api/api.misc").then((module) => module.syncBatch);
  }
  return syncBatchPromise;
};

export const registerSyncAuthStateProvider = (provider: () => SyncAuthState) => {
  authStateProvider = provider;
  return () => {
    if (authStateProvider === provider) {
      authStateProvider = () => emptyAuthState;
    }
  };
};

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
  wakeReason?: "reconnect" | "periodic" | "manual";
}

export interface SyncSchedulerOptions {
  intervalMs?: number;
  runImmediately?: boolean;
}

export interface SyncRuntimeMetrics {
  reconnectWakeupsScheduled: number;
  reconnectWakeupsTriggered: number;
  periodicWakeupsTriggered: number;
  periodicReschedules: number;
  syncRunsStarted: number;
  syncRunsSucceeded: number;
  syncRunsFailed: number;
  syncRunsSkipped: number;
  lastWakeReason: "reconnect" | "periodic" | "manual" | null;
  lastIntervalMs: number | null;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSyncError: string | null;
}

// Simple in-memory lock to prevent concurrent syncs
let isSyncing = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let activeSyncCleanup: (() => void) | null = null;
const EMPTY_SYNC_RESULT: SyncResult = { success: 0, failed: 0, total: 0, errors: [] };
const syncRuntimeMetrics: SyncRuntimeMetrics = {
  reconnectWakeupsScheduled: 0,
  reconnectWakeupsTriggered: 0,
  periodicWakeupsTriggered: 0,
  periodicReschedules: 0,
  syncRunsStarted: 0,
  syncRunsSucceeded: 0,
  syncRunsFailed: 0,
  syncRunsSkipped: 0,
  lastWakeReason: null,
  lastIntervalMs: null,
  lastSyncStartedAt: null,
  lastSyncCompletedAt: null,
  lastSyncError: null,
};

const clearReconnectTimer = () => {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const clearPeriodicSyncInterval = () => {
  if (periodicSyncInterval !== null) {
    clearInterval(periodicSyncInterval);
    periodicSyncInterval = null;
  }
};

const getPeriodicSyncIntervalMs = (overrideIntervalMs?: number): number => {
  if (typeof overrideIntervalMs === "number") {
    return Math.max(5 * 60 * 1000, overrideIntervalMs);
  }

  const minutes = useSettingsStore.getState().settings.autoSyncInterval;
  return Math.max(5, minutes) * 60 * 1000;
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

const asString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const firstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    const normalized = asString(value);
    if (normalized) return normalized;
  }
  return null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toIsoTimestamp = (...values: unknown[]): string => {
  const raw = firstString(...values);
  if (!raw) return new Date().toISOString();
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
};

const resolveClientRecordId = (item: OfflineQueueItem): string => {
  const audit = asObject(item.data.audit);
  return (
    firstString(
      item.idempotency_key,
      item.data.idempotency_key,
      audit.idempotency_key,
      item.data._id,
      item.data.id,
      item.id,
    ) || item.id
  );
};

const resolveSerialNumbers = (data: Record<string, unknown>): string[] => {
  const serials = new Set<string>();

  if (Array.isArray(data.serial_numbers)) {
    for (const serial of data.serial_numbers) {
      const normalized = asString(serial);
      if (normalized) serials.add(normalized);
    }
  }

  if (Array.isArray(data.serial_entries)) {
    for (const entry of data.serial_entries) {
      const normalized = firstString(asObject(entry).serial_number);
      if (normalized) serials.add(normalized);
    }
  }

  return [...serials];
};

const resolveEvidencePhotos = (data: Record<string, unknown>): string[] => {
  const photos = new Set<string>();

  if (Array.isArray(data.evidence_photos)) {
    for (const photo of data.evidence_photos) {
      const normalized = asString(photo);
      if (normalized) photos.add(normalized);
    }
  }

  if (Array.isArray(data.photo_proofs)) {
    for (const proof of data.photo_proofs) {
      if (typeof proof === "string") {
        const normalized = asString(proof);
        if (normalized) photos.add(normalized);
        continue;
      }

      const proofObject = asObject(proof);
      const normalized = firstString(
        proofObject.url,
        proofObject.uri,
        proofObject.previewUri,
        proofObject.base64,
      );
      if (normalized) photos.add(normalized);
    }
  }

  const photoBase64 = asString(data.photo_base64);
  if (photoBase64) photos.add(photoBase64);

  return [...photos];
};

const resolveCanonicalStatus = (data: Record<string, unknown>): SyncRecord["status"] => {
  const normalized = firstString(data.status)?.toLowerCase();
  return normalized === "partial" ? "partial" : "finalized";
};

const buildSyncRecord = (
  item: OfflineQueueItem
): { record: SyncRecord; queueId: string } | { error: string; queueId: string } => {
  if (item.type !== "count_line") {
    return {
      queueId: item.id,
      error: `Unsupported offline item type '${item.type}' for records-based sync`,
    };
  }

  const data = item.data;
  const audit = asObject(data.audit);
  const clientRecordId = resolveClientRecordId(item);
  const sessionId = firstString(data.session_id);
  const itemCode = firstString(data.item_code);
  const floorId = firstString(data.floor_id, data.floor_no, data.floor, data.location_name);
  const rackId = firstString(data.rack_id, data.rack_no, data.rack);
  const locationId = firstString(
    data.location_id,
    data.location,
    data.location_type,
    data.warehouse_id,
    data.warehouse,
    data.mark_location,
    floorId,
  );
  const verifiedQty = asNumber(data.verified_qty) ?? asNumber(data.counted_qty);

  const missingFields = [
    !clientRecordId ? "client_record_id" : null,
    !sessionId ? "session_id" : null,
    !locationId ? "location_id" : null,
    !floorId ? "floor_id" : null,
    !rackId ? "rack_id" : null,
    !itemCode ? "item_code" : null,
    verifiedQty === null ? "verified_qty" : null,
  ].filter(Boolean);

  if (missingFields.length > 0) {
    return {
      queueId: item.id,
      error: `Missing required sync fields: ${missingFields.join(", ")}`,
    };
  }

  const damagedQty =
    (asNumber(data.damaged_qty) ?? 0) +
    (asNumber(data.non_returnable_damaged_qty) ?? 0);
  const createdAt = toIsoTimestamp(
    data.created_at,
    data.counted_at,
    data.cached_at,
    audit.offline_created_at,
    item.timestamp,
  );
  const updatedAt = toIsoTimestamp(
    data.updated_at,
    data.counted_at,
    data.cached_at,
    audit.offline_created_at,
    item.timestamp,
  );

  return {
    queueId: item.id,
    record: {
      client_record_id: clientRecordId,
      session_id: sessionId!,
      location_id: locationId!,
      floor_id: floorId!,
      rack_id: rackId!,
      floor: floorId,
      item_code: itemCode!,
      verified_qty: verifiedQty!,
      damaged_qty: damagedQty,
      serial_numbers: resolveSerialNumbers(data),
      mfg_date: firstString(data.mfg_date, data.manufacturing_date),
      mrp: asNumber(data.mrp) ?? asNumber(data.mrp_counted),
      uom: firstString(data.uom, data.uom_name, data.uom_code),
      category: firstString(data.category, data.category_correction),
      subcategory: firstString(data.subcategory, data.subcategory_correction),
      item_condition: firstString(data.item_condition, data.condition),
      evidence_photos: resolveEvidencePhotos(data),
      status: resolveCanonicalStatus(data),
      created_at: createdAt,
      updated_at: updatedAt,
    },
  };
};

const getSkipReason = (options?: SyncOptions): string | null => {
  if (isSyncing) {
    return "sync_in_progress";
  }

  if (!isDefinitelyOnline()) {
    return "offline";
  }

  const settings = useSettingsStore.getState().settings;
  if (options?.background && (settings.offlineMode || !settings.autoSyncEnabled)) {
    return "background_sync_disabled";
  }

  const authState = authStateProvider();
  if (!authState.isAuthenticated || !authState.user) {
    return "unauthenticated";
  }

  return null;
};

const runBackgroundSync = async (
  wakeReason: "reconnect" | "periodic",
): Promise<void> => {
  if (wakeReason === "reconnect") {
    syncRuntimeMetrics.reconnectWakeupsTriggered += 1;
  } else {
    syncRuntimeMetrics.periodicWakeupsTriggered += 1;
  }
  syncRuntimeMetrics.lastWakeReason = wakeReason;
  await syncOfflineQueue({ background: true, wakeReason });
};

const restartPeriodicSync = (shouldRunImmediately: boolean): void => {
  clearPeriodicSyncInterval();
  syncRuntimeMetrics.periodicReschedules += 1;

  const { autoSyncEnabled, offlineMode } = useSettingsStore.getState().settings;
  if (!autoSyncEnabled || offlineMode) {
    log.debug("Periodic sync disabled by user settings");
    syncRuntimeMetrics.lastIntervalMs = null;
    return;
  }

  const intervalMs = getPeriodicSyncIntervalMs(periodicSyncIntervalOverrideMs);
  syncRuntimeMetrics.lastIntervalMs = intervalMs;

  if (shouldRunImmediately) {
    void runBackgroundSync("periodic").catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      log.warn("Periodic sync run failed", { error: message });
    });
  }

  periodicSyncInterval = setInterval(() => {
    void runBackgroundSync("periodic").catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      log.warn("Periodic sync wakeup failed", { error: message });
    });
  }, intervalMs);
  log.debug("Started periodic sync schedule", { intervalMs });
};

export const startSyncService = (options?: SyncSchedulerOptions): void => {
  const runImmediately = options?.runImmediately ?? true;
  periodicSyncIntervalOverrideMs = options?.intervalMs;
  restartPeriodicSync(runImmediately);

  if (!periodicSettingsUnsubscribe) {
    periodicSettingsUnsubscribe = useSettingsStore.subscribe(
      (state, previousState) => {
        const current = state.settings;
        const previous = previousState.settings;
        if (
          current.autoSyncEnabled === previous.autoSyncEnabled &&
          current.autoSyncInterval === previous.autoSyncInterval &&
          current.offlineMode === previous.offlineMode
        ) {
          return;
        }

        restartPeriodicSync(
          current.autoSyncEnabled &&
            !current.offlineMode &&
            (!previous.autoSyncEnabled || previous.offlineMode),
        );
      },
    );
  }
};

export const stopSyncService = (): void => {
  clearPeriodicSyncInterval();
  periodicSyncIntervalOverrideMs = undefined;
  if (periodicSettingsUnsubscribe) {
    periodicSettingsUnsubscribe();
    periodicSettingsUnsubscribe = null;
  }
};

export const getSyncRuntimeMetrics = (): SyncRuntimeMetrics => ({
  ...syncRuntimeMetrics,
});

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
  const queueItemsById = new Map<string, OfflineQueueItem>();
  for (const item of batch) {
    queueItemsById.set(item.id, item);
    queueItemsById.set(resolveClientRecordId(item), item);
  }

  const successIds = new Set<string>();
  const errors: { id: string; error: string }[] = [];
  const retryUpdates: Promise<unknown>[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (const result of results) {
    const queueItem = queueItemsById.get(result.id);
    const queueItemId = queueItem?.id || result.id;

    if (result.success) {
      successIds.add(queueItemId);
      successCount += 1;
      continue;
    }

    failedCount += 1;
    const errorMessage = result.message || "Unknown error";
    errors.push({ id: queueItemId, error: errorMessage });
    log.warn(`Sync item failed: ${queueItemId} - ${errorMessage}`);
    const nextRetryCount = (queueItem?.retries || 0) + 1;
    retryUpdates.push(
      updateQueueItemRetries(queueItemId, {
        error: errorMessage,
        status: deriveFailureStatus(errorMessage, nextRetryCount),
        attemptedAt: new Date().toISOString(),
      }),
    );
  }

  if (retryUpdates.length > 0) {
    await Promise.all(retryUpdates);
  }

  const syncedQueueIds = [...successIds];
  if (syncedQueueIds.length > 0) {
    await removeManyFromOfflineQueue(syncedQueueIds);
    log.debug(`Removed ${syncedQueueIds.length} synced items from queue`);
    await removeSyncedSessionsFromCache(batch, syncedQueueIds);
  }

  return { successCount, failedCount, errors };
};

const handleInvalidSyncItems = async (
  invalidItems: { queueId: string; error: string }[],
) => {
  if (invalidItems.length === 0) {
    return { failedCount: 0, errors: [] as { id: string; error: string }[] };
  }

  const attemptedAt = new Date().toISOString();
  await Promise.all(
    invalidItems.map((item) =>
      updateOfflineQueueItem(item.queueId, {
        status: "failed_manual_review",
        last_error: item.error,
        last_attempted_at: attemptedAt,
      }),
    ),
  );

  return {
    failedCount: invalidItems.length,
    errors: invalidItems.map((item) => ({ id: item.queueId, error: item.error })),
  };
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
  const preparedItems = batch.map(buildSyncRecord);
  const validItems = preparedItems.filter(
    (item): item is { record: SyncRecord; queueId: string } => "record" in item,
  );
  const records = validItems.map((item) => item.record);
  const validQueueIds = new Set(validItems.map((item) => item.queueId));
  const validBatch = batch.filter((item) => validQueueIds.has(item.id));
  const invalidItems = preparedItems.filter(
    (item): item is { error: string; queueId: string } => "error" in item,
  );

  log.debug(`Processing batch ${batchIndex + 1}`, {
    batchSize: batch.length,
    records: records.map((record) => ({
      id: record.client_record_id,
      itemCode: record.item_code,
    })),
    invalidItems: invalidItems.length,
  });

  const invalidResult = await handleInvalidSyncItems(invalidItems);
  if (records.length === 0) {
    return { successCount: 0, ...invalidResult };
  }

  try {
    const syncBatch = await getSyncBatch();
    const response = await syncBatch(records, `offline-${Date.now()}-${batchIndex + 1}`);
    const batchResult = await handleBatchResults(validBatch, response.results || []);
    return {
      successCount: batchResult.successCount,
      failedCount: batchResult.failedCount + invalidResult.failedCount,
      errors: [...batchResult.errors, ...invalidResult.errors],
    };
  } catch (error: unknown) {
    const failure = await handleBatchFailure(validBatch, error);
    return {
      successCount: 0,
      failedCount: failure.failedCount + invalidResult.failedCount,
      errors: [...failure.errors, ...invalidResult.errors],
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

  const initialState = useNetworkStore.getState();
  // Writes are gated on confirmed reachability (isInternetReachable === true),
  // not just isOnline. On web/LAN, NetInfo leaves reachability unknown and the
  // backend health check is what flips it — so treat that flip as "came
  // online" too, or queued counts wait for a manual sync tap.
  let networkReady = initialState.isOnline && initialState.isInternetReachable === true;

  const unsubscribe = useNetworkStore.subscribe((state) => {
    const wasOnline = networkReady;
    networkReady = state.isOnline && state.isInternetReachable === true;

    if (networkReady && !wasOnline) {
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

      clearReconnectTimer();
      syncRuntimeMetrics.reconnectWakeupsScheduled += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        const authState = authStateProvider();
        if (authState.isAuthenticated && authState.user) {
          log.debug("Authenticated and online, triggering sync");
          void runBackgroundSync("reconnect").catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            log.warn("Reconnect sync failed", { error: message });
          });
        } else {
          log.debug("Not authenticated yet, skipping sync until login");
        }
      }, RECONNECT_SYNC_DELAY_MS);
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
 * Flushes queued offline records in batches when auth and connectivity allow it.
 */
export const syncOfflineQueue = async (
  options?: SyncOptions,
): Promise<SyncResult> => {
  const skipReason = getSkipReason(options);
  if (skipReason) {
    syncRuntimeMetrics.syncRunsSkipped += 1;
    log.debug("Skipping sync run", { reason: skipReason });
    return EMPTY_SYNC_RESULT;
  }

  isSyncing = true;
  syncRuntimeMetrics.syncRunsStarted += 1;
  syncRuntimeMetrics.lastWakeReason =
    options?.wakeReason ?? (options?.background ? "periodic" : "manual");
  syncRuntimeMetrics.lastSyncStartedAt = new Date().toISOString();
  syncRuntimeMetrics.lastSyncError = null;

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
    syncRuntimeMetrics.syncRunsFailed += 1;
    syncRuntimeMetrics.lastSyncError = errorMessage;
    syncRuntimeMetrics.lastSyncCompletedAt = new Date().toISOString();
    return {
      success: 0,
      failed: 0,
      total: 0,
      errors: [{ id: "general", error: errorMessage }],
    };
  } finally {
    if (syncRuntimeMetrics.lastSyncError === null) {
      syncRuntimeMetrics.syncRunsSucceeded += 1;
      syncRuntimeMetrics.lastSyncCompletedAt = new Date().toISOString();
    }
    isSyncing = false;
  }
};

/**
 * Forces an explicit sync attempt using the standard offline queue flow.
 */
export const forceSync = async (options?: SyncOptions): Promise<SyncResult> => {
  return syncOfflineQueue(options);
};
