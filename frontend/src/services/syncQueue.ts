import { logger } from '@/services/logging';
import {
  saveLocalItems,
  getLatestItemSyncTimestamp,
  LocalItem,
} from "../db/localDb";
import { isOnline } from "./api/api";
import api from "./httpClient";
import { syncOfflineQueue } from "./syncService";

/**
 * SyncQueue service handles background synchronization of offline data.
 */
export const syncQueue = {
  /**
   * Push pending count records to the server through the single offline queue.
   */
  pushPendingVerifications: async () => {
    if (!isOnline()) return { success: 0, failed: 0 };

    const result = await syncOfflineQueue({ background: true });
    return { success: result.success, failed: result.failed };
  },

  /**
   * Pull updated items from the server.
   */
  pullUpdatedItems: async (lastSyncTimestamp?: string) => {
    if (!isOnline()) return 0;

    try {
      const since = lastSyncTimestamp ?? (await getLatestItemSyncTimestamp()) ?? undefined;
      const response = await api.get("/api/v2/erp/items/sync", {
        params: { since },
      });

      const items: LocalItem[] = response.data.items.map((item: any) => ({
        barcode: item.barcode,
        name: item.item_name,
        category: item.category,
        verified: item.verified ? 1 : 0,
        last_sync: new Date().toISOString(),
      }));

      if (items.length > 0) {
        await saveLocalItems(items);
      }

      return items.length;
    } catch (error) {
      logger.error("Failed to pull updated items:", error);
      return 0;
    }
  },

  /**
   * Perform a full sync (push then pull).
   */
  performFullSync: async (lastSyncTimestamp?: string) => {
    const pushResult = await syncQueue.pushPendingVerifications();
    const pullCount = await syncQueue.pullUpdatedItems(lastSyncTimestamp);

    return {
      pushed: pushResult.success,
      pulled: pullCount,
    };
  },
};
