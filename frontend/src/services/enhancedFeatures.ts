import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Item } from "../types/scan";

const RECENT_ITEMS_KEY = "stock_verify_recent_items";
const ANALYTICS_EVENTS_KEY = "analytics_data";
const MAX_ANALYTICS_EVENTS = 250;

/** Recent item with scan timestamp */
export interface RecentItem extends Item {
  scanned_at: string;
  floor_no?: string;
  rack_no?: string;
  counted_qty?: number;
}

/** Generic analytics data payload */
type AnalyticsData = Record<string, string | number | boolean | undefined>;

interface AnalyticsEventRecord {
  event: string;
  item_code?: string;
  item_name?: string;
  quantity?: number;
  session_id?: string;
  floor_no?: string;
  rack_no?: string;
  barcode?: string;
  scanned_at: string;
}

const readAnalyticsEvents = async (): Promise<AnalyticsEventRecord[]> => {
  try {
    const raw = await AsyncStorage.getItem(ANALYTICS_EVENTS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Error reading analytics events:", error);
    return [];
  }
};

const writeAnalyticsEvents = async (
  events: AnalyticsEventRecord[],
): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      ANALYTICS_EVENTS_KEY,
      JSON.stringify(events.slice(-MAX_ANALYTICS_EVENTS)),
    );
  } catch (error) {
    console.error("Error writing analytics events:", error);
  }
};

export const AnalyticsService = {
  trackCount: async (
    itemCode: string,
    quantity: number,
    data: AnalyticsData = {},
  ) => {
    const events = await readAnalyticsEvents();
    events.push({
      event: "count",
      item_code: itemCode,
      quantity,
      session_id:
        typeof data.sessionId === "string" ? data.sessionId : undefined,
      floor_no: typeof data.floorNo === "string" ? data.floorNo : undefined,
      rack_no: typeof data.rackNo === "string" ? data.rackNo : undefined,
      barcode: typeof data.barcode === "string" ? data.barcode : undefined,
      scanned_at: new Date().toISOString(),
    });
    await writeAnalyticsEvents(events);
  },
  trackItemScan: async (
    itemCode: string,
    itemName: string,
    data: AnalyticsData = {},
  ) => {
    const events = await readAnalyticsEvents();
    events.push({
      event: "scan",
      item_code: itemCode,
      item_name: itemName,
      session_id:
        typeof data.sessionId === "string" ? data.sessionId : undefined,
      floor_no: typeof data.floorNo === "string" ? data.floorNo : undefined,
      rack_no: typeof data.rackNo === "string" ? data.rackNo : undefined,
      barcode: typeof data.barcode === "string" ? data.barcode : undefined,
      scanned_at: new Date().toISOString(),
    });
    await writeAnalyticsEvents(events);
  },
  getRecentActivity: async (sessionId: string): Promise<RecentItem[]> => {
    const events = await readAnalyticsEvents();
    return events
      .filter((event) => !sessionId || event.session_id === sessionId)
      .sort((left, right) =>
        right.scanned_at.localeCompare(left.scanned_at),
      )
      .slice(0, 20)
      .map((event) => ({
        item_code: event.item_code,
        item_name: event.item_name || event.item_code || "Recent activity",
        barcode: event.barcode || event.item_code,
        scanned_at: event.scanned_at,
        floor_no: event.floor_no,
        rack_no: event.rack_no,
        counted_qty: event.quantity,
      })) as RecentItem[];
  },
  trackEvent: async (eventName: string, data: AnalyticsData) => {
    const events = await readAnalyticsEvents();
    events.push({
      event: eventName,
      item_code: typeof data.itemCode === "string" ? data.itemCode : undefined,
      item_name: typeof data.itemName === "string" ? data.itemName : undefined,
      quantity: typeof data.quantity === "number" ? data.quantity : undefined,
      session_id:
        typeof data.sessionId === "string" ? data.sessionId : undefined,
      floor_no: typeof data.floorNo === "string" ? data.floorNo : undefined,
      rack_no: typeof data.rackNo === "string" ? data.rackNo : undefined,
      barcode: typeof data.barcode === "string" ? data.barcode : undefined,
      scanned_at: new Date().toISOString(),
    });
    await writeAnalyticsEvents(events);
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
      console.error("Error adding recent item:", error);
    }
  },

  getRecent: async (): Promise<RecentItem[]> => {
    try {
      const items = await AsyncStorage.getItem(RECENT_ITEMS_KEY);
      return items ? JSON.parse(items) : [];
    } catch (error) {
      console.error("Error getting recent items:", error);
      return [];
    }
  },

  getRecentItems: async (_itemCode?: string): Promise<RecentItem[]> => {
    // This seems to be an alias or specific query that mimics getRecent for now
    // Based on usage in scan-v2, it likely just needs the general list
    return RecentItemsService.getRecent();
  },

  clearRecent: async () => {
    try {
      await AsyncStorage.removeItem(RECENT_ITEMS_KEY);
    } catch (error) {
      console.error("Error clearing recent items:", error);
    }
  },
};
