import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Item } from "../types/scan";
import { createLogger } from "./logging";

const log = createLogger("enhancedFeatures");
const RECENT_ITEMS_KEY = "stock_verify_recent_items";

/** Recent item with scan timestamp */
export interface RecentItem extends Item {
  scanned_at: string;
  floor_no?: string;
  rack_no?: string;
  counted_qty?: number;
}

/** Generic analytics data payload */
type AnalyticsData = Record<string, string | number | boolean | undefined>;

export const AnalyticsService = {
  trackCount: async (itemCode: string, quantity: number) => {
    log.debug("Tracking count", { itemCode, quantity });
  },
  trackItemScan: async (itemCode: string, itemName: string) => {
    log.debug("Tracking item scan", { itemCode, itemName });
  },
  getRecentActivity: async (_sessionId: string): Promise<RecentItem[]> => {
    return [];
  },
  trackEvent: async (eventName: string, data: AnalyticsData) => {
    log.debug("Tracking event", { eventName, data });
  },
};

export const RecentItemsService = {
  addRecent: async (itemCode: string, item: Item) => {
    try {
      const existingItems = await RecentItemsService.getRecent();

      // Remove duplicate if exists
      const filtered = existingItems.filter(
        (i) => (i.item_code || i.barcode) !== itemCode,
      );

      // Add new item to beginning
      const newItem: RecentItem = {
        ...item,
        scanned_at: new Date().toISOString(),
        item_code: itemCode, // Ensure item_code is set
      };

      const updated = [newItem, ...filtered].slice(0, 10); // Keep last 10

      await AsyncStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(updated));
    } catch (error) {
      log.error("Error adding recent item", { error });
    }
  },

  getRecent: async (): Promise<RecentItem[]> => {
    try {
      const items = await AsyncStorage.getItem(RECENT_ITEMS_KEY);
      return items ? JSON.parse(items) : [];
    } catch (error) {
      log.error("Error getting recent items", { error });
      return [];
    }
  },

  getRecentItems: async (_itemCode?: string): Promise<RecentItem[]> => {
    return RecentItemsService.getRecent();
  },

  clearRecent: async () => {
    try {
      await AsyncStorage.removeItem(RECENT_ITEMS_KEY);
    } catch (error) {
      log.error("Error clearing recent items", { error });
    }
  },
};
