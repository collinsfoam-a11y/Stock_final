import { createLogger } from "./logging";
import AsyncStorageDefault, {
  type AsyncStorageStatic,
} from "@react-native-async-storage/async-storage";
import * as AsyncStorageModule from "@react-native-async-storage/async-storage";

const log = createLogger("mmkvStorage");
const AsyncStorage: AsyncStorageStatic =
  AsyncStorageDefault ??
  (AsyncStorageModule as unknown as { default?: AsyncStorageStatic }).default ??
  (AsyncStorageModule as unknown as AsyncStorageStatic);

// Use AsyncStorage with an in-memory cache for synchronous-like access.
// react-native-mmkv v4 requires react-native-nitro-modules which cannot be
// resolved in Expo Go (Metro resolves imports statically), so we use
// AsyncStorage exclusively for maximum compatibility.

log.info("Using AsyncStorage storage engine (Expo Go compatible)");

// Simple in-memory cache to mimic sync behavior for current session
const memoryCache = new Map<string, string>();

// Hydrate only small, essential keys from AsyncStorage on start (best effort).
// Skip large cache blobs (sessions_cache, items_cache, count_lines_cache, etc.)
// to avoid blocking the JS thread at startup.
const LARGE_CACHE_KEYS = new Set([
  "sessions_cache",
  "items_cache",
  "count_lines_cache",
  "offline_queue",
]);

Promise.resolve(
  typeof AsyncStorage.getAllKeys === "function" ? AsyncStorage.getAllKeys() : []
)
  .then((keys: readonly string[]) => {
    const smallKeys = (keys as string[]).filter((k) => !LARGE_CACHE_KEYS.has(k));
    if (smallKeys.length > 0 && typeof AsyncStorage.multiGet === "function") {
      return AsyncStorage.multiGet(smallKeys);
    }
    return [];
  })
  .then((pairs) => {
    if (pairs && pairs.length > 0) {
      pairs.forEach(([key, value]: readonly [string, string | null]) => {
        if (value) memoryCache.set(key, value);
      });
      log.info(`Hydrated ${pairs.length} keys from AsyncStorage`);
    }
  })
  .catch((e) => log.warn("Failed to hydrate from AsyncStorage", { error: String(e) }));

const storage = {
  set: (key: string, value: string) => {
    memoryCache.set(key, value);
    if (typeof AsyncStorage.setItem === "function") {
      AsyncStorage.setItem(key, value).catch((e: any) => log.error("AsyncStorage set failed", e));
    }
  },
  getString: (key: string) => memoryCache.get(key),
  remove: (key: string) => {
    memoryCache.delete(key);
    if (typeof AsyncStorage.removeItem === "function") {
      AsyncStorage.removeItem(key).catch((e: any) =>
        log.error("AsyncStorage remove failed", e)
      );
    }
  },
  clearAll: () => {
    memoryCache.clear();
    if (typeof AsyncStorage.clear === "function") {
      AsyncStorage.clear().catch((e: any) => log.error("AsyncStorage clear failed", e));
    }
  },
};

/**
 * MMKV Storage engine
 * Provides synchronous, high-performance key-value storage.
 * Direct drop-in replacement for the previous shim.
 */
export const mmkvStorage = {
  /**
   * Synchronously get an item
   */
  getItem: (key: string): string | null => {
    try {
      const value = storage.getString(key);
      return value ?? null;
    } catch (err) {
      log.warn("Failed to get item", { key, error: String(err) });
      return null;
    }
  },

  /**
   * Async version for compatibility with high-level code thinking storage might be slow
   */
  getItemAsync: async (key: string): Promise<string | null> => {
    return mmkvStorage.getItem(key);
  },

  /**
   * Synchronously set an item
   */
  setItem: (key: string, value: string): void => {
    try {
      storage.set(key, value);
    } catch (err) {
      log.warn("Failed to set item", { key, error: String(err) });
    }
  },

  /**
   * Synchronously remove an item
   */
  removeItem: (key: string): void => {
    try {
      storage.remove(key);
    } catch (err) {
      log.warn("Failed to remove item", { key, error: String(err) });
    }
  },

  /**
   * Flush all items (noop for MMKV as it's already synchronous and thread-safe)
   */
  flush: async (): Promise<void> => {
    // MMKV is already synchronous
    return Promise.resolve();
  },

  /**
   * Initialize (noop for MMKV, maintained for API compatibility)
   */
  initialize: async (): Promise<void> => {
    log.debug("MMKV storage ready");
    return Promise.resolve();
  },

  /**
   * Clear all storage (use with caution)
   */
  clearAll: (): void => {
    try {
      storage.clearAll();
    } catch (err) {
      log.warn("Failed to clear storage", { error: String(err) });
    }
  },
};
