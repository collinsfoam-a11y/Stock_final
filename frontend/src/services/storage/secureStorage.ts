import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createLogger } from "../logging";

const log = createLogger("secureStorage");

/**
 * Platform-independent secure storage wrapper.
 *
 * Native: expo-secure-store (Keychain / Keystore).
 * Web: localStorage, except for the keys in WEB_MEMORY_ONLY_KEYS, which are held
 * in memory only and never persisted.
 *
 * Values round-trip unchanged: whatever setItem stores, getItem returns. Callers
 * depend on this. An earlier version special-cased "biometric_pin" by storing a
 * hash under "biometric_pin_hash" while getItem returned null for that key, which
 * silently broke biometric login on every fallback path (the write and the read
 * could never meet).
 *
 * SECURITY: on web the biometric PIN is therefore recoverable from localStorage,
 * so any XSS on this origin yields account takeover via PIN login. This is an
 * accepted tradeoff to keep biometric login working on the web build. Prefer
 * moving to a device-bound biometric refresh token issued by the backend, which
 * removes the need to persist a replayable credential at all.
 */

// Configure SecureStore options
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK, // iOS: Allow access when device is unlocked
  requireAuthentication: true, // Require biometric authentication to access sensitive items
};

const WEB_MEMORY_ONLY_KEYS = new Set([
  "auth_token",
  "refresh_token",
  "auth_user",
]);
const webMemoryStore = new Map<string, string>();

const isWebMemoryOnlyKey = (key: string) =>
  Platform.OS === "web" && WEB_MEMORY_ONLY_KEYS.has(key);

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
        localStorage.setItem(key, value);
        return;
      }
      await SecureStore.setItemAsync(key, value, OPTIONS);
    } catch (error) {
      log.error("SecureStorage setItem error", { error, key });
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
      log.error("SecureStorage getItem error", { error, key });
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
        localStorage.removeItem(key);
        return;
      }
      await SecureStore.deleteItemAsync(key, OPTIONS);
    } catch (error) {
      log.error("SecureStorage removeItem error", { error, key });
      // Don't throw on delete failure, just log
    }
  }
  
  /**
   * Remove the stored biometric PIN.
   *
   * Also clears `biometric_pin_hash`, which earlier builds wrote instead of the
   * PIN itself. That hash is no longer produced or read, but installs upgraded
   * from those builds still carry one, so unlinking biometrics must clear both.
   */
  async removeBiometricPin(): Promise<void> {
    try {
      if (Platform.OS === "web") {
        localStorage.removeItem("biometric_pin");
        localStorage.removeItem("biometric_pin_hash");
        return;
      }
      await SecureStore.deleteItemAsync("biometric_pin", OPTIONS);
      await SecureStore.deleteItemAsync("biometric_pin_hash", OPTIONS);
    } catch (error) {
      log.error("SecureStorage removeBiometricPin error", { error });
      // Don't throw on delete failure, just log
    }
  }
}

export const secureStorage = new SecureStorage();
