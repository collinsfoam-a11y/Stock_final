import type { AxiosInstance, AxiosRequestConfig, AxiosError } from "axios";
// import apiClient from './httpClient';
import { storage } from "../storage/asyncStorageService";
import { useNetworkStore } from "../../store/networkStore";
import { flags } from "../../constants/flags";
import { toastService } from "../toastService";
import { createLogger } from "../logging";
import {
  OPERATIONAL_TELEMETRY_EVENT_REGISTRY,
  operationalTelemetry,
} from "../observability/operationalTelemetry";
import { onlineManager } from "@tanstack/react-query";
import {
  appendMutationJournalEvent,
  readMutationJournalSnapshot,
} from "./offlineMutationJournal";

// NOTE: This module is entirely gated by flags.enableOfflineQueue
// It safely no-ops when the flag is false.

const STORAGE_KEY = "offlineQueue:v1";
const CONFLICTS_KEY = "offlineQueue:conflicts:v1";
const log = createLogger("OfflineQueue");
const MUTATION_QUEUE_LEASE_MS = 10 * 60 * 1000;

export type QueueMethod = "post" | "put" | "patch" | "delete";

export interface QueuedMutation {
  id: string;
  method: QueueMethod;
  url: string; // relative to api base (config.baseURL set by interceptor)
  data?: any;
  params?: any;
  headers?: Record<string, string>;
  createdAt: number;
  retries: number;
  leaseOwner?: string | null;
  leaseToken?: string | null;
  leaseAcquiredAt?: number | null;
  leaseExpiresAt?: number | null;
}

interface MutationQueueLease {
  owner: string;
  token: string;
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const flushOwner = `offline-flush-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
let legacyMutationQueueMigrationChecked = false;

const createLease = (): MutationQueueLease => ({
  owner: flushOwner,
  token: generateId(),
});

const normalizeQueuedMutation = (item: QueuedMutation): QueuedMutation => ({
  ...item,
  retries: Number.isFinite(Number(item.retries)) ? Number(item.retries) : 0,
  leaseOwner: item.leaseOwner ?? null,
  leaseToken: item.leaseToken ?? null,
  leaseAcquiredAt: item.leaseAcquiredAt ?? null,
  leaseExpiresAt: item.leaseExpiresAt ?? null,
});

function isLeaseActive(item: QueuedMutation, now = Date.now()): boolean {
  return Boolean(
    item.leaseOwner &&
      item.leaseToken &&
      item.leaseExpiresAt &&
      Number(item.leaseExpiresAt) > now
  );
}

function isLeaseOwnedBy(
  item: QueuedMutation,
  lease: MutationQueueLease,
  now = Date.now()
): boolean {
  return (
    isLeaseActive(item, now) &&
    item.leaseOwner === lease.owner &&
    item.leaseToken === lease.token
  );
}

async function migrateLegacyMutationQueueIfNeeded(): Promise<void> {
  if (legacyMutationQueueMigrationChecked) return;
  legacyMutationQueueMigrationChecked = true;

  const snapshot = await readMutationJournalSnapshot();
  if (snapshot.queue.length > 0 || snapshot.conflicts.length > 0) return;

  const legacyQueue = await storage.get<QueuedMutation[]>(STORAGE_KEY, {
    defaultValue: [],
    silent: true,
  });
  if (Array.isArray(legacyQueue)) {
    for (const item of legacyQueue.map(normalizeQueuedMutation)) {
      await appendMutationJournalEvent("enqueue", item.id, item);
    }
  }

  const legacyConflicts = await storage.get<any[]>(CONFLICTS_KEY, {
    defaultValue: [],
    silent: true,
  });
  if (Array.isArray(legacyConflicts)) {
    for (const conflict of legacyConflicts) {
      if (conflict?.id) {
        await appendMutationJournalEvent("conflict", String(conflict.id), conflict);
      }
    }
  }
}

async function loadQueue(): Promise<QueuedMutation[]> {
  await migrateLegacyMutationQueueIfNeeded();
  const snapshot = await readMutationJournalSnapshot();
  return snapshot.queue.map((item) => normalizeQueuedMutation(item as QueuedMutation));
}

async function loadConflicts(): Promise<any[]> {
  await migrateLegacyMutationQueueIfNeeded();
  const snapshot = await readMutationJournalSnapshot();
  return snapshot.conflicts;
}

async function addConflict(item: QueuedMutation, detail?: any): Promise<void> {
  const record = { ...item, detail, resolved: false, timestamp: Date.now() };
  await appendMutationJournalEvent("conflict", item.id, record);
}

async function acquireMutationLease(
  itemId: string,
  lease: MutationQueueLease,
  leaseMs = MUTATION_QUEUE_LEASE_MS
): Promise<QueuedMutation | null> {
  const queue = await loadQueue();
  const item = queue.find((entry) => entry.id === itemId);
  if (!item) return null;
  const now = Date.now();
  if (isLeaseActive(item, now) && !isLeaseOwnedBy(item, lease, now)) {
    return null;
  }

  const leasedItem = normalizeQueuedMutation({
    ...item,
    leaseOwner: lease.owner,
    leaseToken: lease.token,
    leaseAcquiredAt: now,
    leaseExpiresAt: now + leaseMs,
  });
  await appendMutationJournalEvent("update", itemId, {
    leaseOwner: leasedItem.leaseOwner,
    leaseToken: leasedItem.leaseToken,
    leaseAcquiredAt: leasedItem.leaseAcquiredAt,
    leaseExpiresAt: leasedItem.leaseExpiresAt,
  });
  return leasedItem;
}

async function updateQueuedMutation(
  itemId: string,
  patch: Partial<QueuedMutation>,
  lease: MutationQueueLease
): Promise<boolean> {
  const queue = await loadQueue();
  const item = queue.find((entry) => entry.id === itemId);
  if (!item || !isLeaseOwnedBy(item, lease)) return false;
  await appendMutationJournalEvent("update", itemId, patch);
  return true;
}

async function removeQueuedMutation(
  itemId: string,
  lease: MutationQueueLease,
  reason: string
): Promise<boolean> {
  const queue = await loadQueue();
  const item = queue.find((entry) => entry.id === itemId);
  if (!item || !isLeaseOwnedBy(item, lease)) return false;
  await appendMutationJournalEvent("remove", itemId, {
    reason,
    removedAt: Date.now(),
    leaseOwner: lease.owner,
  });
  return true;
}

async function releaseMutationLease(
  itemId: string,
  lease: MutationQueueLease
): Promise<boolean> {
  return updateQueuedMutation(
    itemId,
    {
      leaseOwner: null,
      leaseToken: null,
      leaseAcquiredAt: null,
      leaseExpiresAt: null,
    },
    lease
  );
}

function isMutatingMethod(method?: string): method is QueueMethod {
  if (!method) return false;
  const m = method.toLowerCase();
  return m === "post" || m === "put" || m === "patch" || m === "delete";
}

export async function enqueueMutation(config: AxiosRequestConfig): Promise<QueuedMutation> {
  const item: QueuedMutation = {
    id: generateId(),
    method: (config.method || "post").toLowerCase() as QueueMethod,
    url: config.url || "/",
    data: config.data,
    params: config.params,
    headers: config.headers as Record<string, string> | undefined,
    createdAt: Date.now(),
    retries: 0,
    leaseOwner: null,
    leaseToken: null,
    leaseAcquiredAt: null,
    leaseExpiresAt: null,
  };
  await appendMutationJournalEvent("enqueue", item.id, item);
  const queue = await loadQueue();
  operationalTelemetry.trackQueue(
    OPERATIONAL_TELEMETRY_EVENT_REGISTRY.QUEUE_ENQUEUED,
    "offline",
    {
      method: item.method,
      url: item.url,
    },
    {
      queueLength: queue.length,
    }
  );
  return item;
}

// M15 fix: Use a promise-based lock to avoid async gap race in the boolean guard.
let flushPromise: Promise<{ processed: number; remaining: number }> | null = null;

export async function flushOfflineQueue(
  client: AxiosInstance
): Promise<{ processed: number; remaining: number }> {
  if (!flags.enableOfflineQueue) return { processed: 0, remaining: 0 };
  // If already flushing, wait for the existing flush to complete
  if (flushPromise) return flushPromise;

  const { isOnline, isInternetReachable, isRestrictedMode } = useNetworkStore.getState();
  const online = !isRestrictedMode && isOnline && (isInternetReachable ?? true);
  onlineManager.setOnline(online);
  if (!online) {
    const remaining = (await loadQueue()).length;
    operationalTelemetry.trackQueue(
      OPERATIONAL_TELEMETRY_EVENT_REGISTRY.QUEUE_FLUSH_COMPLETED,
      "skipped",
      { reason: "offline" },
      { processed: 0, remaining }
    );
    return { processed: 0, remaining };
  }

  flushPromise = _doFlush(client);
  return flushPromise;
}

async function _doFlush(
  client: AxiosInstance
): Promise<{ processed: number; remaining: number }> {
  const flushMark = operationalTelemetry.markStart({
    name: OPERATIONAL_TELEMETRY_EVENT_REGISTRY.QUEUE_FLUSH_COMPLETED,
    category: "queue",
    surface: "offline_queue_interceptor",
  });
  try {
    let queue = await loadQueue();
    let processed = 0;
    const startingLength = queue.length;

    while (queue.length > 0) {
      const candidate = queue[0]!;
      const lease = createLease();
      const item = await acquireMutationLease(candidate.id, lease);
      if (!item) {
        break;
      }

      // Safety check: Drop auth requests that might have been queued
      // This prevents infinite loops if a login request got stuck in the queue
      if (item.url && item.url.includes("/auth/")) {
        log.warn("Dropping queued auth request", { url: item.url, id: item.id });
        await removeQueuedMutation(item.id, lease, "auth_request_not_replayable");
        queue = await loadQueue();
        continue;
      }

      let itemRemoved = false;
      try {
        await client.request({
          method: item.method,
          url: item.url,
          data: item.data,
          params: item.params,
          headers: item.headers,
        });
        processed += 1;
      } catch (err) {
        const error = err as AxiosError;
        const status = error.response?.status;
        // Network still down or server unreachable: stop processing, keep remaining
        if (!error.response) {
          await releaseMutationLease(item.id, lease);
          break;
        }
        // Conflict, validation error, or AUTH error: record and drop this item, continue
        // We treat 401/403 as fatal for queued items to avoid infinite retry loops
        if (
          status &&
          (status === 409 || status === 422 || status === 400 || status === 401 || status === 403)
        ) {
          await addConflict(item, error.response?.data);
          processed += 1; // we consider it handled (moved to conflicts)
          await removeQueuedMutation(item.id, lease, "terminal_response_conflict");
          itemRemoved = true;
        } else {
          // C6 fix: On 5xx server errors, increment retry counter instead of silently dropping.
          // If max retries exceeded, move to conflicts; otherwise leave in queue for later.
          item.retries = (item.retries || 0) + 1;
          if (item.retries >= 5) {
            await addConflict(item, {
              error: "Max retries exceeded",
              lastStatus: status,
              lastResponse: error.response?.data,
            });
            processed += 1;
            await removeQueuedMutation(item.id, lease, "max_retries_exceeded");
            itemRemoved = true;
          } else {
            await updateQueuedMutation(item.id, { retries: item.retries }, lease);
            await releaseMutationLease(item.id, lease);
            break;
          }
        }
      }
      // Remove the head item we just processed
      if (!itemRemoved) {
        await removeQueuedMutation(item.id, lease, "sync_confirmed");
      }
      queue = await loadQueue();
    }

    const result = { processed, remaining: queue.length };
    operationalTelemetry.markEnd(
      flushMark,
      result.remaining > 0 ? "warning" : "success",
      undefined,
      {
        startingLength,
        processed: result.processed,
        remaining: result.remaining,
      }
    );
    return result;
  } catch (error) {
    operationalTelemetry.markEnd(flushMark, "failure", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    flushPromise = null;
  }
}

let unsubscribeNetwork: (() => void) | null = null;
let interceptorsAttached = false;

export function startOfflineQueue(client: AxiosInstance): void {
  if (!flags.enableOfflineQueue) return;

  // Sync initial online status with React Query
  const { isOnline, isInternetReachable, isRestrictedMode } = useNetworkStore.getState();
  onlineManager.setOnline(!isRestrictedMode && isOnline && (isInternetReachable ?? true));

  // Subscribe to network changes to auto-flush
  if (!unsubscribeNetwork) {
    unsubscribeNetwork = useNetworkStore.subscribe((state: any, _prev: any) => {
      const online =
        !state.isRestrictedMode && state.isOnline && (state.isInternetReachable ?? true);
      onlineManager.setOnline(online);
      if (online && !flushPromise) {
        flushOfflineQueue(client)
          .then((res) => {
            if (__DEV__ && (res.processed > 0 || res.remaining >= 0)) {
              log.debug("Flushed queued mutations", {
                processed: res.processed,
                remaining: res.remaining,
              });
            }
            if (res.processed > 0) {
              try {
                toastService.showSuccess(`Synced ${res.processed} queued change(s)`);
              } catch {}
            }
          })
          .catch(() => {});
      }
    });
  }

  // Attach axios interceptors once
  if (!interceptorsAttached) {
    attachOfflineQueueInterceptors(client);
    interceptorsAttached = true;
  }

  // Try initial flush
  flushOfflineQueue(client).catch(() => {});
}

export function stopOfflineQueue(): void {
  if (unsubscribeNetwork) {
    try {
      unsubscribeNetwork();
    } catch {}
    unsubscribeNetwork = null;
  }
}

export function attachOfflineQueueInterceptors(client: AxiosInstance): void {
  if (!flags.enableOfflineQueue) return;

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const cfg: AxiosRequestConfig = error.config || {};
      const method = (cfg.method || "").toLowerCase();

      // Only handle mutating requests
      if (!isMutatingMethod(method)) {
        return Promise.reject(error);
      }

      // Exclude auth endpoints from offline queue
      // It is dangerous to queue login/auth requests as they can cause loops or security issues
      if (cfg.url && cfg.url.includes("/auth/")) {
        return Promise.reject(error);
      }

      // If backend rejects due to LAN policy, treat like offline and queue mutations.
      const status = error.response?.status;
      const errorCode = (error.response?.data as { code?: string } | undefined)?.code;
      if (status === 403 && errorCode === "NETWORK_NOT_ALLOWED") {
        try {
          useNetworkStore.getState().setRestrictedMode(true);
        } catch {}
        const item = await enqueueMutation(cfg);
        log.warn("Queued mutation due to restricted mode", {
          id: item.id,
          method: item.method,
          url: item.url,
        });
        try {
          toastService.showInfo("Restricted network. Saved offline for later sync.");
        } catch {}
        return Promise.reject(error);
      }

      const { isOnline, isInternetReachable, isRestrictedMode } = useNetworkStore.getState();
      const online = !isRestrictedMode && isOnline && (isInternetReachable ?? true);

      // If offline or network error with no response, queue it
      const isNetworkError = !error.response;
      if (!online || isNetworkError) {
        const item = await enqueueMutation(cfg);
        log.warn("Queued mutation", {
          id: item.id,
          method: item.method,
          url: item.url,
          isNetworkError,
        });
        try {
          toastService.showInfo("Saved offline. Will sync when online.");
        } catch {}
        // Resolve with a synthetic response to unblock UI if desired, otherwise reject
        // Here we reject so callers can decide how to reflect queued state
        return Promise.reject(error);
      }

      return Promise.reject(error);
    }
  );
}

// --- Helpers for UI ---
export async function getQueueCount(): Promise<number> {
  const q = await loadQueue();
  return q.length;
}

export async function listQueue(): Promise<QueuedMutation[]> {
  return loadQueue();
}

export async function getConflicts(): Promise<any[]> {
  return loadConflicts();
}

export async function getConflictsCount(): Promise<number> {
  const c = await getConflicts();
  return c.length;
}

export async function resolveConflict(id: string): Promise<boolean> {
  const existing = await getConflicts();
  const found = existing.some((conflict) => conflict.id === id);
  if (found) {
    await appendMutationJournalEvent("resolve_conflict", id, { resolvedAt: Date.now() });
  }
  return found;
}
