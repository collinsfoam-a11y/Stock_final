import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createLogger } from "../logging";

const log = createLogger("secureStorage");

/**
 * Platform-independent secure storage wrapper
 * Uses expo-secure-store on native platforms
 * Note: On web, SecureStore is not available, so this would need a fallback
 * if we supported web for secure features. Ideally, we shouldn't store sensitive
 * tokens on web local storage without careful consideration, but for now
 * we'll focus on native mobile security.
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
      if (key === "biometric_pin") {
        // For biometric PIN, derive a hash instead of storing the raw PIN
        const hashedValue = await this.hashBiometricPin(value);
        if (Platform.OS === "web") {
          localStorage.setItem(`${key}_hash`, hashedValue);
          return;
        }
        await SecureStore.setItemAsync(`${key}_hash`, hashedValue, OPTIONS);
      } else {
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
      }
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
      if (key === "biometric_pin") {
        // For biometric PIN, we only store the hash, so return null for the raw PIN
        // This ensures the raw PIN is never retrievable
        return null;
      }

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
   * Safe get biometric PIN hash for verification
   */
  async getBiometricPinHash(): Promise<string | null> {
    try {
      if (Platform.OS === "web") {
        return localStorage.getItem("biometric_pin_hash");
      }

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 2000),
      );

      const getPromise = SecureStore.getItemAsync("biometric_pin_hash", OPTIONS);
      const result = await Promise.race([getPromise, timeoutPromise]);

      return result;
    } catch (error) {
      log.error("SecureStorage getBiometricPinHash error", { error });
      return null;
    }
  }

  /**
   * Verify a biometric PIN against the stored hash
   */
  async verifyBiometricPin(inputPin: string): Promise<boolean> {
    try {
      const storedHash = await this.getBiometricPinHash();
      if (!storedHash) {
        return false;
      }

      const inputHash = await this.hashBiometricPin(inputPin);
      return inputHash === storedHash;
    } catch (error) {
      log.error("SecureStorage verifyBiometricPin error", { error });
      return false;
    }
  }

  /**
   * Hash a biometric PIN using a simple approach
   * Note: In a real implementation, we'd use a proper PBKDF2 implementation
   */
  private async hashBiometricPin(pin: string): Promise<string> {
    // For now, implement a simple approach without importing modules dynamically
    // In a real implementation, we'd use a proper PBKDF2 implementation
    try {
      // Since we can't rely on expo-crypto import in this context,
      // we'll use a simple hash approach for now
      const fixedSalt = "fixed_salt_for_fallback";
      let hash = 0;
      
      // Simple hash computation
      for (let i = 0; i < (pin + fixedSalt).length; i++) {
        const char = (pin + fixedSalt).charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32-bit integer
      }
      
      return `${fixedSalt}:${Math.abs(hash).toString(16)}`;
    } catch (error) {
      // Fallback to a simple approach if crypto is not available
      log.warn("Crypto not available, using fallback PIN hashing", { error });
      
      // Simple fallback: combine pin with fixed salt and create hash
      const fixedSalt = "fixed_salt_for_fallback";
      let hash = 0;
      
      for (let i = 0; i < (pin + fixedSalt).length; i++) {
        const char = (pin + fixedSalt).charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32-bit integer
      }
      
      return `${fixedSalt}:${Math.abs(hash).toString(16)}`;
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
   * Remove biometric PIN hash
   */
  async removeBiometricPin(): Promise<void> {
    try {
      if (Platform.OS === "web") {
        localStorage.removeItem("biometric_pin_hash");
        return;
      }
      await SecureStore.deleteItemAsync("biometric_pin_hash", OPTIONS);
    } catch (error) {
      log.error("SecureStorage removeBiometricPin error", { error });
      // Don't throw on delete failure, just log
    }
  }
}

export const secureStorage = new SecureStorage();
