import { storage } from "../storage/asyncStorageService";
import { createLogger } from "../logging";

const log = createLogger("UnifiedSyncStorage");

const UNIFIED_QUEUE_KEY = "unified_sync_queue:v1";

export type SyncStatus = "pending" | "locked" | "error" | "synced";

export interface UnifiedSyncItem {
  id: string;
  type: string;
  payload: any;
  timestamp: string;
  retries: number;
  status: SyncStatus;
  error?: string;
  meta?: Record<string, any>;
}

export class UnifiedSyncStorage {
  private static instance: UnifiedSyncStorage;

  private constructor() {}

  static getInstance(): UnifiedSyncStorage {
    if (!UnifiedSyncStorage.instance) {
      UnifiedSyncStorage.instance = new UnifiedSyncStorage();
    }
    return UnifiedSyncStorage.instance;
  }

  /**
   * Get all items in the queue
   */
  async getQueue(): Promise<UnifiedSyncItem[]> {
    try {
      const queue = await storage.get<UnifiedSyncItem[]>(UNIFIED_QUEUE_KEY, {
        defaultValue: [],
      });
      return Array.isArray(queue) ? queue : [];
    } catch (error) {
      log.error("Failed to get unified queue", { error });
      return [];
    }
  }

  /**
   * Add an item to the queue
   */
  async add(
    item: Omit<UnifiedSyncItem, "timestamp" | "retries" | "status">,
  ): Promise<UnifiedSyncItem> {
    const fullItem: UnifiedSyncItem = {
      ...item,
      timestamp: new Date().toISOString(),
      retries: 0,
      status: "pending" as SyncStatus,
    };

    try {
      const queue = await this.getQueue();

      // Prevent duplicates by ID
      const existingIndex = queue.findIndex((i) => i.id === fullItem.id);
      if (existingIndex >= 0) {
        queue[existingIndex] = { ...queue[existingIndex], ...fullItem };
      } else {
        queue.push(fullItem);
      }

      await storage.set(UNIFIED_QUEUE_KEY, queue, { silent: true });
      log.debug("Added item to unified queue", {
        id: fullItem.id,
        type: fullItem.type,
      });
      return fullItem;
    } catch (error) {
      log.error("Failed to add item to unified queue", {
        error,
        id: fullItem.id,
      });
      throw error;
    }
  }

  /**
   * Update an item in the queue
   */
  async update(id: string, updates: Partial<UnifiedSyncItem>): Promise<void> {
    try {
      const queue = await this.getQueue();
      const index = queue.findIndex((i) => i.id === id);
      if (index >= 0) {
        queue[index] = { ...queue[index], ...updates } as UnifiedSyncItem;
        await storage.set(UNIFIED_QUEUE_KEY, queue, { silent: true });
      }
    } catch (error) {
      log.error("Failed to update unified queue item", { error, id });
    }
  }

  /**
   * Remove items from the queue
   */
  async remove(ids: string[]): Promise<void> {
    try {
      const queue = await this.getQueue();
      const filtered = queue.filter((i) => !ids.includes(i.id));
      await storage.set(UNIFIED_QUEUE_KEY, filtered, { silent: true });
      log.debug("Removed items from unified queue", { count: ids.length });
    } catch (error) {
      log.error("Failed to remove items from unified queue", { error, ids });
    }
  }

  /**
   * Clear the entire queue
   */
  async clear(): Promise<void> {
    await storage.remove(UNIFIED_QUEUE_KEY);
    log.info("Cleared unified sync queue");
  }

  /**
   * Get total pending count
   */
  async getPendingCount(): Promise<number> {
    const queue = await this.getQueue();
    return queue.filter((i) => i.status === "pending").length;
  }

  /**
   * Migrate legacy SQLite pending items to the unified queue
   */
  async migrateFromLegacy(): Promise<void> {
    try {
      const { getPendingVerifications, deletePendingVerification, localDb } =
        await import("../../db/localDb");

      // 1. Migrate verifications
      const verifications = await getPendingVerifications();
      for (const v of verifications) {
        await this.add({
          id: `legacy_verification_${v.id}`,
          type: "item_verification",
          payload: {
            barcode: v.barcode,
            verified: v.verified === 1,
            username: v.username,
            variance: v.variance,
          },
        });
        if (v.id !== undefined) {
          await deletePendingVerification(v.id);
        }
      }

      // 2. Migrate count lines
      const countLines = await localDb.getPendingCountLines();
      for (const cl of countLines) {
        await this.add({
          id: `legacy_count_line_${cl.id}`,
          type: "count_line",
          payload: JSON.parse(cl.payload_json),
        });
        if (cl.id !== undefined) {
          await localDb.deletePendingCountLine(cl.id);
        }
      }

      if (verifications.length > 0 || countLines.length > 0) {
        log.info("Migrated legacy items to unified queue", {
          verifications: verifications.length,
          countLines: countLines.length,
        });
      }
    } catch (error) {
      log.error("Failed to migrate legacy items", { error });
    }
  }
}

export const unifiedSyncStorage = UnifiedSyncStorage.getInstance();
