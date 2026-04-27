import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import { createLogger } from "./logging";

const log = createLogger("deviceId");
const DEVICE_ID_KEY = "device_id";
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

let cachedDeviceId: string | null = null;
let pendingDeviceId: Promise<string> | null = null;

const describeError = (error: unknown): Record<string, string> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
};

const isValidDeviceId = (value: string | null): value is string =>
  typeof value === "string" && value.trim().length > 0;

const readLegacySecureStoreDeviceId = async (): Promise<string | null> => {
  try {
    const legacyDeviceId = await SecureStore.getItemAsync(
      DEVICE_ID_KEY,
      SECURE_STORE_OPTIONS,
    );
    return isValidDeviceId(legacyDeviceId) ? legacyDeviceId : null;
  } catch (error) {
    log.warn("Legacy secure device ID could not be read", describeError(error));
    return null;
  }
};

const clearLegacySecureStoreDeviceId = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(DEVICE_ID_KEY, SECURE_STORE_OPTIONS);
  } catch {
    // Best-effort cleanup only.
  }
};

const loadPersistedDeviceId = async (): Promise<string | null> => {
  try {
    const persisted = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (isValidDeviceId(persisted)) {
      return persisted;
    }
  } catch (error) {
    log.warn("AsyncStorage device ID lookup failed", describeError(error));
  }

  const legacyDeviceId = await readLegacySecureStoreDeviceId();
  if (!legacyDeviceId) {
    return null;
  }

  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, legacyDeviceId);
  } catch (error) {
    log.warn("Failed to migrate legacy secure device ID", describeError(error));
  }

  void clearLegacySecureStoreDeviceId();
  return legacyDeviceId;
};

const createAndPersistDeviceId = async (): Promise<string> => {
  const nextDeviceId = Crypto.randomUUID();

  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, nextDeviceId);
  } catch (error) {
    log.warn("Failed to persist generated Device ID", describeError(error));
  }

  return nextDeviceId;
};

/**
 * Retrieves the persistent Device ID for this installation.
 * Uses AsyncStorage as the source of truth because the value only needs to be
 * stable, not secret. Falls back to a generated in-memory ID if persistence
 * fails, so request headers remain stable for the app lifetime.
 */
export const getDeviceId = async (): Promise<string> => {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  if (!pendingDeviceId) {
    pendingDeviceId = (async () => {
      const persistedDeviceId = await loadPersistedDeviceId();
      if (persistedDeviceId) {
        cachedDeviceId = persistedDeviceId;
        return persistedDeviceId;
      }

      const generatedDeviceId = await createAndPersistDeviceId();
      cachedDeviceId = generatedDeviceId;
      return generatedDeviceId;
    })().finally(() => {
      pendingDeviceId = null;
    });
  }

  return pendingDeviceId;
};
