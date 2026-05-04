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
import type { SyncRecord } from "../types/sync";

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
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let activeSyncCleanup: (() => void) | null = null;
const EMPTY_SYNC_RESULT: SyncResult = { success: 0, failed: 0, total: 0, errors: [] };

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

  let networkReady = useNetworkStore.getState().isOnline;

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
