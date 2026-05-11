import * as Crypto from "expo-crypto";
import { createLogger } from "./logging";
import { mmkvStorage } from "./mmkvStorage";

const log = createLogger("deviceId");
const DEVICE_ID_KEY = "device_id";
let cachedDeviceId: string | null = null;

const createDeviceId = (): string => {
  if (typeof Crypto.randomUUID === "function") {
    return Crypto.randomUUID();
  }

  return `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error || "unknown storage error");
};

/**
 * Retrieves the persistent Device ID for this installation.
 * Generates a new UUID if one does not exist.
 *
 * This ID is used only as a device hint header, not as an auth secret, so it
 * intentionally uses the app's general storage layer instead of SecureStore.
 * Storage failures should never redbox the app during boot or API calls.
 */
export const getDeviceId = async (): Promise<string> => {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  try {
    const storedDeviceId = mmkvStorage.getItem(DEVICE_ID_KEY);

    if (storedDeviceId) {
      cachedDeviceId = storedDeviceId;
      return storedDeviceId;
    }

    const deviceId = createDeviceId();
    mmkvStorage.setItem(DEVICE_ID_KEY, deviceId);
    cachedDeviceId = deviceId;
    log.info("Generated new Device ID");
    return deviceId;
  } catch (error) {
    const deviceId = createDeviceId();
    cachedDeviceId = deviceId;
    log.warn("Using temporary Device ID after storage fallback", {
      error: getErrorMessage(error),
    });
    return deviceId;
  }
};

export const __resetDeviceIdForTests = (): void => {
  cachedDeviceId = null;
};
