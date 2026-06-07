import { logger } from '@/services/logging';
/**
 * Dynamic Port Detection Utility
 * Automatically detects which port the frontend is running on
 * Supports Expo Metro bundler (8081) and Expo Web (19006, 19000-19002)
 */

import { Platform } from "react-native";
import Constants from "expo-constants";

// Common Expo ports
const EXPO_PORTS = [19006, 19000, 19001, 19002, 8081];
const METRO_PORT = 8081;
const DEFAULT_WEB_PORT = 19006;

let cachedPort: number | null = null;
let portDetectionAttempted = false;

const parsePortNumber = (value?: string | null): number | null => {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
};

const logPortSelection = (message: string, port: number) => {
  if (__DEV__) {
    logger.debug(`📡 ${message}: ${port}`);
  }
};

const cacheAndLogPort = (message: string, port: number): number => {
  cachedPort = port;
  logPortSelection(message, port);
  return port;
};

const detectPortFromWindowLocation = (): number | null => {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  return parsePortNumber(window.location.port);
};

const detectPortFromExpoHostUri = (): number | null => {
  if (Platform.OS === "web" || !Constants.expoConfig?.hostUri) return null;
  const parts = Constants.expoConfig.hostUri.split(":");
  return parts.length === 2 ? parsePortNumber(parts[1]) : null;
};

const probeFrontendPort = async (): Promise<number | null> => {
  for (const port of EXPO_PORTS) {
    try {
      const response = await fetch(`http://localhost:${port}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok || response.status < 500) {
        return port;
      }
    } catch {
      continue;
    }
  }
  return null;
};

const getPlatformDefaultPort = (): number =>
  Platform.OS === "web" ? DEFAULT_WEB_PORT : METRO_PORT;

/**
 * Detect which port the frontend is running on
 * Checks common Expo ports and returns the first one that's active
 */
export const detectFrontendPort = async (): Promise<number | null> => {
  if (cachedPort) return cachedPort;
  if (portDetectionAttempted) return null;

  portDetectionAttempted = true;

  const fromWindow = detectPortFromWindowLocation();
  if (fromWindow) return cacheAndLogPort("Detected frontend port from window.location", fromWindow);

  const fromExpo = detectPortFromExpoHostUri();
  if (fromExpo) return cacheAndLogPort("Detected frontend port from Expo Constants", fromExpo);

  const probedPort = await probeFrontendPort();
  if (probedPort) return cacheAndLogPort("Detected frontend port", probedPort);

  const fallbackPort = getPlatformDefaultPort();
  if (Platform.OS === "web") {
    return cacheAndLogPort("Using default web port", fallbackPort);
  }
  return cacheAndLogPort("Using default Metro port", fallbackPort);
};

/**
 * Get frontend port synchronously (returns cached or default)
 */
export const getFrontendPortSync = (): number => {
  if (cachedPort) return cachedPort;

  const detectedPort = detectPortFromWindowLocation() || detectPortFromExpoHostUri();
  if (detectedPort) {
    cachedPort = detectedPort;
    return detectedPort;
  }

  return getPlatformDefaultPort();
};

/**
 * Clear cached port (useful for testing or when port changes)
 */
export const clearPortCache = (): void => {
  cachedPort = null;
  portDetectionAttempted = false;
};

/**
 * Get frontend URL dynamically
 */
export const getFrontendURL = async (): Promise<string> => {
  const port = await detectFrontendPort();

  if (Platform.OS !== "web" && Constants.expoConfig?.hostUri) {
    const parts = Constants.expoConfig.hostUri.split(":");
    const host = parts[0];
    return `http://${host}:${port || METRO_PORT}`;
  }

  return `http://localhost:${port || DEFAULT_WEB_PORT}`;
};

/**
 * Get frontend URL synchronously
 */
export const getFrontendURLSync = (): string => {
  const port = getFrontendPortSync();

  if (Platform.OS !== "web" && Constants.expoConfig?.hostUri) {
    const parts = Constants.expoConfig.hostUri.split(":");
    const host = parts[0];
    return `http://${host}:${port}`;
  }

  return `http://localhost:${port}`;
};

export default {
  detectFrontendPort,
  getFrontendPortSync,
  clearPortCache,
  getFrontendURL,
  getFrontendURLSync,
};
