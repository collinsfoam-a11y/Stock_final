import { logger } from '@/services/logging';
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Platform-independent secure storage wrapper
 * Uses expo-secure-store on native platforms
 * On web, auth tokens use sessionStorage (cleared on tab close) rather than
 * localStorage to reduce the window of exposure for sensitive credentials.
 * Non-sensitive keys still use localStorage for persistence across tabs/sessions.
 */

// Configure SecureStore options
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK, // iOS: Allow access when device is unlocked
};

// Keys that contain auth credentials — stored in sessionStorage on web so they
// are automatically cleared when the browser tab is closed.
const WEB_SESSION_STORAGE_KEYS = new Set([
  "auth_token",
  "refresh_token",
  "access_token",
  "auth_user",
  "biometric_pin",
]);

const WEB_MEMORY_ONLY_KEYS = new Set([
  "auth_token",
  "refresh_token",
  "auth_user",
  "biometric_pin",
]);
const webMemoryStore = new Map<string, string>();

const isWebMemoryOnlyKey = (key: string) =>
  Platform.OS === "web" && WEB_MEMORY_ONLY_KEYS.has(key);

const isWebSessionKey = (key: string) =>
  Platform.OS === "web" && WEB_SESSION_STORAGE_KEYS.has(key);

class SecureStorage {
  /**
   * Safe set item
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === "web") {
        if (isWebMemoryOnlyKey(key)) {
          webMemoryStore.set(key, value);
          localStorage.removeItem(key);
          return;
        }
        // Auth tokens go to sessionStorage (cleared on tab close) for security.
        if (isWebSessionKey(key)) {
          sessionStorage.setItem(key, value);
          return;
        }
        localStorage.setItem(key, value);
        return;
      }
      await SecureStore.setItemAsync(key, value, OPTIONS);
    } catch (error) {
      logger.error("SecureStorage setItem error:", error);
      throw error;
    }
  }

  /**
   * Safe get item with timeout
   */
  async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === "web") {
        if (isWebMemoryOnlyKey(key)) {
          const cached = webMemoryStore.get(key);
          if (cached != null) {
            return cached;
          }

          const migrated = localStorage.getItem(key);
          if (migrated != null) {
            webMemoryStore.set(key, migrated);
            localStorage.removeItem(key);
            return migrated;
          }
          return null;
        }
        // Auth tokens are stored in sessionStorage on web — check there first,
        // then migrate any legacy localStorage value if found.
        if (isWebSessionKey(key)) {
          const sessionVal = sessionStorage.getItem(key);
          if (sessionVal != null) return sessionVal;
          // Migrate old localStorage value on first read.
          const legacyVal = localStorage.getItem(key);
          if (legacyVal != null) {
            sessionStorage.setItem(key, legacyVal);
            localStorage.removeItem(key);
            return legacyVal;
          }
          return null;
        }
        return localStorage.getItem(key);
      }

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 2000),
      );

      const getPromise = SecureStore.getItemAsync(key, OPTIONS);
      const result = await Promise.race([getPromise, timeoutPromise]);

      return result;
    } catch (error) {
      logger.error("SecureStorage getItem error:", error);
      return null;
    }
  }

  /**
   * Safe remove item
   */
  async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS === "web") {
        if (isWebMemoryOnlyKey(key)) {
          webMemoryStore.delete(key);
        }
        if (isWebSessionKey(key)) {
          sessionStorage.removeItem(key);
        }
        localStorage.removeItem(key);
        return;
      }
      await SecureStore.deleteItemAsync(key, OPTIONS);
    } catch (error) {
      logger.error("SecureStorage removeItem error:", error);
      // Don't throw on delete failure, just log
    }
  }
}

export const secureStorage = new SecureStorage();
