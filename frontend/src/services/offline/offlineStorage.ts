import AsyncStorage from "@react-native-async-storage/async-storage";
import { storage } from "../storage/asyncStorageService";
import {
  appendOfflineQueueJournalEvent,
  readOfflineQueueJournal,
  resetOfflineQueueJournal,
} from "./offlineJournal";
import { levenshteinDistance } from "../../utils/algorithms";
import { createLogger } from "../logging";
import { useSettingsStore } from "../../store/settingsStore";

const log = createLogger("OfflineStorage");

function formatStorageError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logStorageError(message: string, error: unknown, context?: Record<string, unknown>): void {
  log.error(message, {
    ...context,
    error: formatStorageError(error),
  });
}

const STORAGE_KEYS = {
  ITEMS_CACHE: "items_cache",
  OFFLINE_QUEUE: "offline_queue",
  OFFLINE_QUEUE_QUARANTINE: "offline_queue_quarantine",
  SESSIONS_CACHE: "sessions_cache",
  COUNT_LINES_CACHE: "count_lines_cache",
  LAST_SYNC: "last_sync",
  USER_DATA: "user_data",
};

/**
 * Data source metadata for cached items
 */
export type DataSource = "api" | "cache" | "offline" | "sql";

/**
 * Extended result with source metadata
 */
export interface CacheResult<T> {
  data: T;
  _source: DataSource;
  _cachedAt: string | null;
  _stale: boolean;
}

/**
 * Check if cached data is stale (older than threshold)
 * Default: 1 hour
 */
export function isCacheStale(
  cachedAt: string | null,
  maxAgeMs: number = useSettingsStore.getState().settings.cacheExpiration * 60 * 60 * 1000
): boolean {
  if (!cachedAt) return true;
  const cacheTime = new Date(cachedAt).getTime();
  return Date.now() - cacheTime > maxAgeMs;
}

export interface CachedItem {
  item_code: string;
  barcode?: string;
  item_name: string;
  description?: string;
  uom?: string;
  uom_name?: string;
  mrp?: number;
  sales_price?: number;
  sale_price?: number;
  category?: string;
  subcategory?: string;
  current_stock?: number;
  warehouse?: string;
  manual_barcode?: string;
  unit2_barcode?: string;
  unit_m_barcode?: string;
  batch_id?: string;
  is_serialized?: boolean;
  cached_at: string;
}

export interface OfflineQueueItem {
  id: string;
  type: "count_line" | "session" | "unknown_item";
  data: Record<string, unknown>;
  timestamp: string;
  retries: number;
  status: "pending" | "pending_retry" | "blocked_conflict" | "failed_manual_review";
  idempotency_key?: string;
  last_error?: string | null;
  last_attempted_at?: string | null;
  /** ISO timestamp after which the item should be pruned rather than synced */
  expires_at?: string;
  lease_owner?: string | null;
  lease_token?: string | null;
  lease_acquired_at?: string | null;
  lease_expires_at?: string | null;
}

export interface OfflineQueueLease {
  owner: string;
  token: string;
}

const OFFLINE_QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const OFFLINE_QUEUE_LEASE_MS = 10 * 60 * 1000; // 10 minutes
let legacyOfflineQueueMigrationChecked = false;

export function makeQueueItemExpiry(now = Date.now()): string {
  return new Date(now + OFFLINE_QUEUE_TTL_MS).toISOString();
}

export function isQueueItemExpired(item: OfflineQueueItem, now = Date.now()): boolean {
  if (!item.expires_at) return false;
  return new Date(item.expires_at).getTime() <= now;
}

export function isQueueLeaseActive(item: OfflineQueueItem, now = Date.now()): boolean {
  if (!item.lease_owner || !item.lease_token || !item.lease_expires_at) return false;
  return new Date(item.lease_expires_at).getTime() > now;
}

export function isQueueLeaseOwnedBy(
  item: OfflineQueueItem,
  lease: OfflineQueueLease,
  now = Date.now()
): boolean {
  return (
    isQueueLeaseActive(item, now) &&
    item.lease_owner === lease.owner &&
    item.lease_token === lease.token
  );
}

export interface CachedSession {
  id: string;
  warehouse: string;
  staff_user: string;
  staff_name: string;
  status: string;
  type: string;
  started_at: string;
  closed_at?: string;
  reconciled_at?: string;
  finalized_at?: string;
  total_items?: number;
  total_variance?: number;
  notes?: string;
  cached_at: string;
  location_type?: string;
  location_name?: string;
  rack_no?: string;
  last_heartbeat?: string;
  finalization_status?: string;
  verified_items?: number;
  pending_items?: number;
  damage_items?: number;
  _local_session_id?: string;
  _server_session_id?: string | null;
  _projection?: boolean;
  _sync_status?: string;
  // Legacy fields fallback
  session_id?: string;
  created_by?: string;
  created_at?: string;
}

export interface CachedCountLine {
  _id: string;
  session_id: string;
  item_code: string;
  item_name: string;
  counted_qty: number;
  system_qty?: number;
  variance?: number;
  counted_by: string;
  counted_at: string;
  cached_at: string;
  rack_no?: string;
  rack?: string;
  rack_id?: string;
  verified?: boolean;
  // Allow any additional audit fields
  [key: string]: unknown;
}

/**
 * Validation result for cache operations
 */
export interface CacheValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate that an item has the minimum required fields for caching.
 * Prevents corrupt cache entries.
 */
export function assertValidCachedItem(item: Partial<CachedItem>): CacheValidationResult {
  const errors: string[] = [];

  if (!item.item_code || typeof item.item_code !== "string") {
    errors.push("item_code is required and must be a string");
  }
  if (!item.item_name || typeof item.item_name !== "string") {
    errors.push("item_name is required and must be a string");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate that a count line has the minimum required fields for caching.
 */
export function assertValidCachedCountLine(line: Partial<CachedCountLine>): CacheValidationResult {
  const errors: string[] = [];

  if (!line._id || typeof line._id !== "string") {
    errors.push("_id is required and must be a string");
  }
  if (!line.session_id || typeof line.session_id !== "string") {
    errors.push("session_id is required and must be a string");
  }
  if (!line.item_code || typeof line.item_code !== "string") {
    errors.push("item_code is required and must be a string");
  }
  if (typeof line.counted_qty !== "number") {
    errors.push("counted_qty is required and must be a number");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Item Cache Operations
export const cacheItem = async (item: Omit<CachedItem, "cached_at">) => {
  try {
    // Validate before caching
    const validation = assertValidCachedItem(item);
    if (!validation.valid) {
      log.warn("Attempted to cache invalid item", {
        errors: validation.errors,
        itemCode: item.item_code,
      });
      // Don't throw - just log and skip to avoid breaking main flow
      return null;
    }

    const cachedItem: CachedItem = {
      ...item,
      cached_at: new Date().toISOString(),
    };

    const existingCache = await getItemsCache();
    const updatedCache = {
      ...existingCache,
      [item.item_code]: cachedItem,
    };

    await storage.set(STORAGE_KEYS.ITEMS_CACHE, updatedCache);
    return cachedItem;
  } catch (error) {
    log.error("Error caching item", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

export const getItemsCache = async (): Promise<Record<string, CachedItem>> => {
  const cache = await storage.get<Record<string, CachedItem>>(STORAGE_KEYS.ITEMS_CACHE, {
    defaultValue: {},
  });
  return cache ?? {};
};

export const getItemFromCache = async (itemCode: string): Promise<CachedItem | null> => {
  try {
    const cache = await getItemsCache();
    return cache[itemCode] || null;
  } catch (error) {
    logStorageError("Error getting item from cache", error, { itemCode });
    return null;
  }
};

export const searchItemsInCache = async (query: string): Promise<CachedItem[]> => {
  try {
    const cache = await getItemsCache();
    const items = Object.values(cache);

    const lowerQuery = query.toLowerCase();

    return items.filter((item) => {
      const code = (item.item_code || "").toLowerCase();
      const name = (item.item_name || "").toLowerCase();
      const barcode = (item.barcode || "").toLowerCase();

      // Direct includes check (fast path)
      if (code.includes(lowerQuery) || name.includes(lowerQuery) || barcode.includes(lowerQuery)) {
        return true;
      }

      // Levenshtein distance check (slower path for typos)
      // Only check if query is long enough to matter
      if (lowerQuery.length > 3) {
        const distName = levenshteinDistance(name, lowerQuery);
        // Allow 2 edits for name
        if (distName <= 2) return true;
      }

      return false;
    });
  } catch (error) {
    logStorageError("Error searching items in cache", error, { query });
    return [];
  }
};

export const clearItemsCache = async () => {
  try {
    await storage.remove(STORAGE_KEYS.ITEMS_CACHE);
  } catch (error) {
    logStorageError("Error clearing items cache", error);
  }
};

// Offline Queue Operations
const buildQueueItemId = (type: OfflineQueueItem["type"], idempotencyKey?: string) =>
  idempotencyKey
    ? `${type}:${idempotencyKey}`
    : `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

const resolveIdempotencyKey = (
  type: OfflineQueueItem["type"],
  data: Record<string, unknown>
): string | undefined => {
  const directKey = data.idempotency_key;
  if (typeof directKey === "string" && directKey.trim()) {
    return directKey.trim();
  }

  const audit = data.audit;
  if (
    audit &&
    typeof audit === "object" &&
    "idempotency_key" in audit &&
    typeof (audit as { idempotency_key?: unknown }).idempotency_key === "string"
  ) {
    return (audit as { idempotency_key: string }).idempotency_key.trim();
  }

  if (type === "count_line") {
    const countLineId = data._id || data.id;
    if (typeof countLineId === "string" && countLineId.trim()) {
      return countLineId.trim();
    }
  }

  if (type === "session") {
    const operation = typeof data.operation === "string" ? data.operation.trim() : "session";
    const sessionId =
      typeof data.sessionId === "string"
        ? data.sessionId
        : typeof data.session_id === "string"
          ? data.session_id
          : typeof data.id === "string"
            ? data.id
            : undefined;
    if (sessionId?.trim()) {
      return `${operation}:${sessionId.trim()}`;
    }
  }

  if (type === "unknown_item") {
    const barcode = data.barcode;
    const sessionId = data.session_id;
    if (typeof barcode === "string" && typeof sessionId === "string") {
      return `${sessionId.trim()}:${barcode.trim()}`;
    }
  }

  return undefined;
};

const normalizeQueueItem = (item: OfflineQueueItem): OfflineQueueItem => {
  const allowedStatuses: OfflineQueueItem["status"][] = [
    "pending",
    "pending_retry",
    "blocked_conflict",
    "failed_manual_review",
  ];
  const normalizedStatus = allowedStatuses.includes(item.status) ? item.status : "pending";

  return {
    ...item,
    status: normalizedStatus,
    idempotency_key: item.idempotency_key || resolveIdempotencyKey(item.type, item.data),
    last_error: item.last_error ?? null,
    last_attempted_at: item.last_attempted_at ?? null,
    lease_owner: item.lease_owner ?? null,
    lease_token: item.lease_token ?? null,
    lease_acquired_at: item.lease_acquired_at ?? null,
    lease_expires_at: item.lease_expires_at ?? null,
  };
};

export const addToOfflineQueue = async (
  type: OfflineQueueItem["type"],
  data: Record<string, unknown>
) => {
  try {
    const queue = await getOfflineQueue();
    const idempotencyKey = resolveIdempotencyKey(type, data);
    const existingIndex =
      idempotencyKey !== undefined
        ? queue.findIndex((item) => item.type === type && item.idempotency_key === idempotencyKey)
        : -1;
    const queueItem: OfflineQueueItem = {
      id: buildQueueItemId(type, idempotencyKey),
      type,
      data,
      timestamp: new Date().toISOString(),
      retries: 0,
      status: "pending",
      idempotency_key: idempotencyKey,
      last_error: null,
      last_attempted_at: null,
      expires_at: makeQueueItemExpiry(),
    };

    if (existingIndex >= 0) {
      const existing = queue[existingIndex]!;
      const updatedItem: OfflineQueueItem = {
        ...existing,
        data,
        timestamp: queueItem.timestamp,
        status: "pending",
        last_error: null,
      };
      await appendOfflineQueueJournalEvent("replace", updatedItem.id, updatedItem);
      return updatedItem;
    }

    const nextLength = queue.length + 1;
    const maxQueueSize = useSettingsStore.getState().settings.maxQueueSize;
    if (nextLength > maxQueueSize) {
      log.warn("Offline queue exceeded advisory limit; preserving all entries", {
        queueLength: nextLength,
        maxQueueSize,
      });
    }
    await appendOfflineQueueJournalEvent("enqueue", queueItem.id, queueItem);
    return queueItem;
  } catch (error) {
    logStorageError("Error adding to offline queue", error, { type });
    throw error;
  }
};

const migrateLegacyOfflineQueueIfNeeded = async () => {
  if (legacyOfflineQueueMigrationChecked) return;
  legacyOfflineQueueMigrationChecked = true;

  const currentJournalQueue = await readOfflineQueueJournal();
  if (currentJournalQueue.length > 0) return;

  const legacyQueue = await storage.get<OfflineQueueItem[]>(STORAGE_KEYS.OFFLINE_QUEUE, {
    defaultValue: [],
  });
  if (!Array.isArray(legacyQueue) || legacyQueue.length === 0) return;

  for (const item of legacyQueue.map(normalizeQueueItem)) {
    await appendOfflineQueueJournalEvent("enqueue", item.id, item);
  }
  log.warn("Migrated legacy AsyncStorage offline queue into append-only journal", {
    migratedItems: legacyQueue.length,
  });
};

export const getOfflineQueue = async (): Promise<OfflineQueueItem[]> => {
  try {
    await migrateLegacyOfflineQueueIfNeeded();

    const now = Date.now();
    const normalized = (await readOfflineQueueJournal()).map(normalizeQueueItem);
    const expired = normalized.filter((item) => isQueueItemExpired(item, now));
    const active = normalized.filter((item) => !isQueueItemExpired(item, now));

    if (expired.length > 0) {
      log.warn(`Quarantined ${expired.length} expired offline queue item(s)`, {
        expiredIds: expired.map((i) => i.id),
      });
      const existingQuarantine = await storage.get<OfflineQueueItem[]>(
        STORAGE_KEYS.OFFLINE_QUEUE_QUARANTINE,
        { defaultValue: [] }
      );
      const quarantined = expired.map((item) =>
        normalizeQueueItem({
          ...item,
          status: "failed_manual_review",
          last_error: "Offline queue item expired before sync and requires manual review",
          last_attempted_at: new Date(now).toISOString(),
        })
      );
      await storage.set(STORAGE_KEYS.OFFLINE_QUEUE_QUARANTINE, [
        ...(Array.isArray(existingQuarantine) ? existingQuarantine : []),
        ...quarantined,
      ]);
      for (const item of expired) {
        await appendOfflineQueueJournalEvent("remove", item.id, {
          reason: "expired_before_sync",
          removed_at: new Date(now).toISOString(),
        });
      }
    }

    return active;
  } catch (error) {
    logStorageError("Error getting offline queue", error);
    throw error;
  }
};

export const removeFromOfflineQueue = async (id: string) => {
  try {
    await appendOfflineQueueJournalEvent("remove", id, { removed_at: new Date().toISOString() });
  } catch (error) {
    logStorageError("Error removing from offline queue", error, { id });
  }
};

const filterIdsByLease = async (ids: string[], lease?: OfflineQueueLease): Promise<string[]> => {
  if (!lease) return ids;
  const now = Date.now();
  const queue = await getOfflineQueue();
  const queueById = new Map(queue.map((item) => [item.id, item]));
  return ids.filter((id) => {
    const item = queueById.get(id);
    return item ? isQueueLeaseOwnedBy(item, lease, now) : false;
  });
};

export const removeManyFromOfflineQueue = async (ids: string[], lease?: OfflineQueueLease) => {
  try {
    const eligibleIds = await filterIdsByLease(ids, lease);
    const queue = await getOfflineQueue();
    const removeSet = new Set(eligibleIds);
    const removedCount = queue.filter((item) => removeSet.has(item.id)).length;

    // T079: Log deletion for verification
    if (removedCount > 0) {
      log.debug("Removed confirmed items from offline queue", {
        removed: removedCount,
        remaining: queue.length - removedCount,
      });
    }

    for (const id of eligibleIds) {
      await appendOfflineQueueJournalEvent("remove", id, {
        removed_at: new Date().toISOString(),
        reason: "sync_confirmed",
      });
    }
  } catch (error) {
    logStorageError("Error removing many from offline queue", error, {
      idsCount: ids.length,
    });
  }
};

export const updateQueueItemRetries = async (
  id: string,
  options?: {
    error?: string;
    status?: OfflineQueueItem["status"];
    attemptedAt?: string;
  },
  lease?: OfflineQueueLease
) => {
  try {
    const queue = await getOfflineQueue();
    const item = queue.find((entry) => entry.id === id);
    if (!item) return;
    if (lease && !isQueueLeaseOwnedBy(item, lease)) return;
    await appendOfflineQueueJournalEvent("update", id, {
      retries: item.retries + 1,
      status: options?.status || "pending_retry",
      last_error: options?.error ?? item.last_error ?? null,
      last_attempted_at: options?.attemptedAt || new Date().toISOString(),
    });
  } catch (error) {
    logStorageError("Error updating queue item retries", error, { id });
  }
};

export const updateOfflineQueueItem = async (
  id: string,
  patch: Partial<OfflineQueueItem>,
  lease?: OfflineQueueLease
) => {
  try {
    if (lease) {
      const queue = await getOfflineQueue();
      const item = queue.find((entry) => entry.id === id);
      if (!item || !isQueueLeaseOwnedBy(item, lease)) return;
    }
    await appendOfflineQueueJournalEvent("update", id, patch);
  } catch (error) {
    logStorageError("Error updating offline queue item", error, { id });
  }
};

export const acquireOfflineQueueLeases = async (
  ids: string[],
  lease: OfflineQueueLease,
  leaseMs = OFFLINE_QUEUE_LEASE_MS
): Promise<OfflineQueueItem[]> => {
  const queue = await getOfflineQueue();
  const idSet = new Set(ids);
  const now = Date.now();
  const acquiredAt = new Date(now).toISOString();
  const leaseExpiresAt = new Date(now + leaseMs).toISOString();
  const leasedItems: OfflineQueueItem[] = [];

  for (const item of queue) {
    if (!idSet.has(item.id)) continue;
    if (isQueueLeaseActive(item, now) && !isQueueLeaseOwnedBy(item, lease, now)) {
      continue;
    }
    const leasedItem = normalizeQueueItem({
      ...item,
      lease_owner: lease.owner,
      lease_token: lease.token,
      lease_acquired_at: acquiredAt,
      lease_expires_at: leaseExpiresAt,
    });
    await appendOfflineQueueJournalEvent("update", item.id, {
      lease_owner: lease.owner,
      lease_token: lease.token,
      lease_acquired_at: acquiredAt,
      lease_expires_at: leaseExpiresAt,
    });
    leasedItems.push(leasedItem);
  }

  return leasedItems;
};

export const renewOfflineQueueLeases = async (
  ids: string[],
  lease: OfflineQueueLease,
  leaseMs = OFFLINE_QUEUE_LEASE_MS
): Promise<string[]> => {
  const queue = await getOfflineQueue();
  const idSet = new Set(ids);
  const now = Date.now();
  const leaseExpiresAt = new Date(now + leaseMs).toISOString();
  const renewedIds: string[] = [];

  for (const item of queue) {
    if (!idSet.has(item.id)) continue;
    if (!isQueueLeaseOwnedBy(item, lease, now)) continue;
    await appendOfflineQueueJournalEvent("update", item.id, {
      lease_expires_at: leaseExpiresAt,
    });
    renewedIds.push(item.id);
  }

  return renewedIds;
};

export const releaseOfflineQueueLeases = async (
  ids: string[],
  lease: OfflineQueueLease
): Promise<string[]> => {
  const queue = await getOfflineQueue();
  const idSet = new Set(ids);
  const now = Date.now();
  const releasedIds: string[] = [];

  for (const item of queue) {
    if (!idSet.has(item.id)) continue;
    if (!isQueueLeaseOwnedBy(item, lease, now)) continue;
    await appendOfflineQueueJournalEvent("update", item.id, {
      lease_owner: null,
      lease_token: null,
      lease_acquired_at: null,
      lease_expires_at: null,
    });
    releasedIds.push(item.id);
  }

  return releasedIds;
};

export const clearOfflineQueue = async () => {
  try {
    await resetOfflineQueueJournal();
    await storage.remove(STORAGE_KEYS.OFFLINE_QUEUE);
  } catch (error) {
    logStorageError("Error clearing offline queue", error);
  }
};

// Session Cache Operations
export const cacheSession = async (
  session: Omit<CachedSession, "cached_at"> | any // Use any to allow backend objects to be passed in
) => {
  try {
    const displayId =
      session.id || session._id || session.server_session_id || session._server_session_id;
    const localSessionId =
      session._local_session_id || session.local_session_id || session.session_id || displayId;
    // Normalization logic
    const normalizedSession: CachedSession = {
      id: displayId || `temp_${Date.now()}`,
      warehouse: session.warehouse,
      status: session.status,
      type: session.type || "STANDARD",
      staff_user: session.staff_user || session.created_by || "unknown",
      staff_name: session.staff_name || "Staff",
      started_at: session.started_at || session.created_at || new Date().toISOString(),
      closed_at: session.closed_at,
      reconciled_at: session.reconciled_at,
      finalized_at: session.finalized_at,
      location_type: session.location_type,
      location_name: session.location_name,
      rack_no: session.rack_no,
      last_heartbeat: session.last_heartbeat,
      finalization_status: session.finalization_status,
      total_items: session.total_items,
      total_variance: session.total_variance,
      verified_items: session.verified_items,
      pending_items: session.pending_items,
      damage_items: session.damage_items,
      notes: session.notes,
      session_id: localSessionId,
      _local_session_id: localSessionId,
      _server_session_id:
        session._server_session_id ||
        session.server_session_id ||
        session.id ||
        session._id ||
        null,
      _projection: Boolean(session._projection),
      _sync_status: session._sync_status,
      cached_at: new Date().toISOString(),
    };

    if (!normalizedSession.id || normalizedSession.id === "undefined") {
      log.warn("Attempted to cache session with invalid ID", {
        session_id: session?.session_id,
        id: session?.id,
        warehouse: session?.warehouse,
        status: session?.status,
      });
      return normalizedSession;
    }

    const existingCache = await getSessionsCache();
    const updatedCache = {
      ...existingCache,
      [normalizedSession.id]: normalizedSession,
    };

    // Remove any undefined keys if present
    delete (updatedCache as any)["undefined"];

    await storage.set(STORAGE_KEYS.SESSIONS_CACHE, updatedCache);
    return normalizedSession;
  } catch (error) {
    logStorageError("Error caching session", error, {
      sessionId: session?.id || session?.session_id,
    });
    throw error;
  }
};

/**
 * Batch cache multiple sessions in a single read-write cycle.
 * Avoids the O(n²) overhead of calling cacheSession in a loop.
 */
export const cacheSessions = async (sessions: (Omit<CachedSession, "cached_at"> | any)[]) => {
  try {
    if (!sessions || sessions.length === 0) return;

    const existingCache = await getSessionsCache();
    const updatedCache = { ...existingCache };
    const now = new Date().toISOString();

    for (const session of sessions) {
      const id =
        session.id || session._id || session.server_session_id || session._server_session_id;
      const localSessionId =
        session._local_session_id || session.local_session_id || session.session_id || id;
      if (!id || id === "undefined") continue;

      updatedCache[id] = {
        id,
        warehouse: session.warehouse,
        status: session.status,
        type: session.type || "STANDARD",
        staff_user: session.staff_user || session.created_by || "unknown",
        staff_name: session.staff_name || "Staff",
        started_at: session.started_at || session.created_at || now,
        closed_at: session.closed_at,
        reconciled_at: session.reconciled_at,
        finalized_at: session.finalized_at,
        location_type: session.location_type,
        location_name: session.location_name,
        rack_no: session.rack_no,
        last_heartbeat: session.last_heartbeat,
        finalization_status: session.finalization_status,
        total_items: session.total_items,
        total_variance: session.total_variance,
        verified_items: session.verified_items,
        pending_items: session.pending_items,
        damage_items: session.damage_items,
        notes: session.notes,
        session_id: localSessionId,
        _local_session_id: localSessionId,
        _server_session_id:
          session._server_session_id ||
          session.server_session_id ||
          session.id ||
          session._id ||
          null,
        _projection: Boolean(session._projection),
        _sync_status: session._sync_status,
        cached_at: now,
      };
    }

    // Remove any undefined keys
    delete (updatedCache as any)["undefined"];

    await storage.set(STORAGE_KEYS.SESSIONS_CACHE, updatedCache);
    log.debug("Batch cached sessions", { count: sessions.length });
  } catch (error) {
    log.error("Error batch caching sessions", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const removeSessionFromCache = async (sessionId: string) => {
  try {
    const cache = await getSessionsCache();
    if (cache[sessionId]) {
      const { [sessionId]: _removed, ...rest } = cache;
      await storage.set(STORAGE_KEYS.SESSIONS_CACHE, rest);
      log.debug("Removed session from cache", { sessionId });
    }
  } catch (error) {
    log.error("Error removing session from cache", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const getSessionsCache = async (): Promise<Record<string, CachedSession>> => {
  try {
    const cache = await storage.get<Record<string, CachedSession>>(STORAGE_KEYS.SESSIONS_CACHE, {
      defaultValue: {},
    });

    // Self-healing: remove undefined keys
    if (cache && (cache as any)["undefined"]) {
      if (__DEV__) {
        log.debug("Cleaning invalid session cache entry", { key: "undefined" });
      }
      const cleanCache = { ...cache };
      delete (cleanCache as any)["undefined"];
      await storage.set(STORAGE_KEYS.SESSIONS_CACHE, cleanCache);
      return cleanCache;
    }

    return cache ?? {};
  } catch (error) {
    logStorageError("Error getting sessions cache", error);
    return {};
  }
};

export const getSessionFromCache = async (sessionId: string): Promise<CachedSession | null> => {
  try {
    const cache = await getSessionsCache();
    if (cache[sessionId]) {
      return cache[sessionId] || null;
    }

    return (
      Object.values(cache).find(
        (session) =>
          session.session_id === sessionId ||
          session._local_session_id === sessionId ||
          session._server_session_id === sessionId
      ) || null
    );
  } catch (error) {
    logStorageError("Error getting session from cache", error, { sessionId });
    return null;
  }
};

// Count Lines Cache Operations
export const cacheCountLine = async (countLine: Omit<CachedCountLine, "cached_at">) => {
  try {
    // Validate before caching
    const validation = assertValidCachedCountLine(countLine);
    if (!validation.valid) {
      log.warn("Attempted to cache invalid count line", {
        errors: validation.errors,
        lineId: countLine._id,
      });
      // Don't throw - just log and skip to avoid breaking main flow
      return null;
    }

    const sessionId = String(countLine.session_id);
    const cachedCountLine: CachedCountLine = {
      ...(countLine as any),
      cached_at: new Date().toISOString(),
    };

    const existingCache = await getCountLinesCache();
    const sessionLines: CachedCountLine[] = existingCache[sessionId] || [];

    // Update or add the count line
    const existingIndex = sessionLines.findIndex(
      (line: CachedCountLine) => line._id === countLine._id
    );
    if (existingIndex >= 0) {
      sessionLines[existingIndex] = cachedCountLine;
    } else {
      sessionLines.push(cachedCountLine);
    }

    const updatedCache: Record<string, CachedCountLine[]> = {
      ...existingCache,
      [sessionId]: sessionLines,
    };

    await storage.set(STORAGE_KEYS.COUNT_LINES_CACHE, updatedCache);
    return cachedCountLine;
  } catch (error) {
    log.error("Error caching count line", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Batch cache multiple count lines in a single read-write cycle.
 * Avoids O(n²) overhead of calling cacheCountLine in a loop.
 */
export const cacheCountLines = async (countLines: Omit<CachedCountLine, "cached_at">[]) => {
  try {
    if (!countLines || countLines.length === 0) return;

    const existingCache = await getCountLinesCache();
    const updatedCache: Record<string, CachedCountLine[]> = { ...existingCache };
    const now = new Date().toISOString();

    // Group by session to optimize array lookups (O(1) instead of O(n^2))
    const sessionMap: Record<string, Map<string, CachedCountLine>> = {};

    for (const countLine of countLines) {
      const validation = assertValidCachedCountLine(countLine);
      if (!validation.valid) continue;

      const sessionId = String(countLine.session_id);
      const cachedCountLine: CachedCountLine = {
        ...(countLine as any),
        cached_at: now,
      };

      // Lazily initialize the map for this session
      if (!sessionMap[sessionId]) {
        const existingLines = updatedCache[sessionId] || [];
        sessionMap[sessionId] = new Map(existingLines.map((line) => [line._id, line]));
      }

      // O(1) update or insertion
      sessionMap[sessionId].set(cachedCountLine._id, cachedCountLine);
    }

    // Convert the modified maps back to arrays
    for (const [sessionId, map] of Object.entries(sessionMap)) {
      updatedCache[sessionId] = Array.from(map.values());
    }

    await storage.set(STORAGE_KEYS.COUNT_LINES_CACHE, updatedCache);
    log.debug("Batch cached count lines", { count: countLines.length });
  } catch (error) {
    log.error("Error batch caching count lines", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const getCountLinesCache = async (): Promise<Record<string, CachedCountLine[]>> => {
  try {
    const cache = await storage.get<Record<string, CachedCountLine[]>>(
      STORAGE_KEYS.COUNT_LINES_CACHE,
      { defaultValue: {} }
    );
    return cache ?? {};
  } catch (error) {
    logStorageError("Error getting count lines cache", error);
    return {};
  }
};

export const getCountLinesBySessionFromCache = async (
  sessionId: string | string[]
): Promise<CachedCountLine[]> => {
  try {
    const cache = await getCountLinesCache();
    const sessionIds = Array.isArray(sessionId) ? sessionId : [sessionId];
    return sessionIds.flatMap((id) => cache[id] || []);
  } catch (error) {
    logStorageError("Error getting count lines by session from cache", error, {
      sessionId,
    });
    return [];
  }
};

export const removeCountLineFromCache = async (
  sessionId: string,
  lineId: string
): Promise<void> => {
  try {
    const cache = await getCountLinesCache();
    const sessionLines = cache[sessionId] || [];
    if (sessionLines.length === 0) {
      return;
    }

    const filteredLines = sessionLines.filter((line) => line._id !== lineId);
    if (filteredLines.length === sessionLines.length) {
      return;
    }

    const updatedCache: Record<string, CachedCountLine[]> = {
      ...cache,
      [sessionId]: filteredLines,
    };
    await storage.set(STORAGE_KEYS.COUNT_LINES_CACHE, updatedCache);
  } catch (error) {
    logStorageError("Error removing count line from cache", error, {
      sessionId,
      lineId,
    });
  }
};

// Last Sync Operations
export const updateLastSync = async () => {
  try {
    await storage.set(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
  } catch (error) {
    logStorageError("Error updating last sync", error);
  }
};

export const getLastSync = async (): Promise<string | null> => {
  try {
    return await storage.get(STORAGE_KEYS.LAST_SYNC);
  } catch (error) {
    logStorageError("Error getting last sync", error);
    return null;
  }
};

// Clear all cache
export const clearAllCache = async () => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.ITEMS_CACHE,
      STORAGE_KEYS.OFFLINE_QUEUE,
      STORAGE_KEYS.SESSIONS_CACHE,
      STORAGE_KEYS.COUNT_LINES_CACHE,
      STORAGE_KEYS.LAST_SYNC,
    ]);
  } catch (error) {
    logStorageError("Error clearing all cache", error);
  }
};

// Get cache statistics
export const getCacheStats = async () => {
  try {
    const itemsCache = await getItemsCache();
    const offlineQueue = await getOfflineQueue();
    const sessionsCache = await getSessionsCache();
    const countLinesCache = await getCountLinesCache();
    const lastSync = await getLastSync();

    return {
      itemsCount: Object.keys(itemsCache).length,
      queuedOperations: offlineQueue.length,
      sessionsCount: Object.keys(sessionsCache).length,
      countLinesCount: Object.values(countLinesCache).reduce(
        (total, lines) => total + lines.length,
        0
      ),
      lastSync,
      cacheSizeKB: Math.round(
        (JSON.stringify(itemsCache).length +
          JSON.stringify(offlineQueue).length +
          JSON.stringify(sessionsCache).length +
          JSON.stringify(countLinesCache).length) /
          1024
      ),
    };
  } catch (error) {
    logStorageError("Error getting cache stats", error);
    return {
      itemsCount: 0,
      queuedOperations: 0,
      sessionsCount: 0,
      countLinesCount: 0,
      lastSync: null,
      cacheSizeKB: 0,
    };
  }
};
