/**
 * Centralized URL Configuration
 *
 * Single source of truth for all backend endpoint URLs.
 * Reads EXPO_PUBLIC_BACKEND_URL from the environment and provides typed
 * accessors for the API base, WebSocket, and health-check endpoints.
 *
 * Priority:
 *   1. EXPO_PUBLIC_BACKEND_URL (explicit override, e.g. production deploy)
 *   2. http://localhost:8001 in dev
 */

import { Platform } from "react-native";

const DEFAULT_BACKEND_PORT = 8001;

/** Remove a trailing slash so callers can safely append paths. */
const stripTrailingSlash = (url: string): string =>
  url.endsWith("/") ? url.slice(0, -1) : url;

/**
 * Build the default base URL for the current platform when no explicit env
 * override is present.
 */
const buildDefaultBaseUrl = (): string => {
  // Android emulator cannot reach the host machine on localhost — use the
  // special alias instead.
  if (Platform.OS === "android") {
    return `http://10.0.2.2:${DEFAULT_BACKEND_PORT}`;
  }
  return `http://localhost:${DEFAULT_BACKEND_PORT}`;
};

/**
 * Resolve the API base URL, applying the env override when available.
 * The returned value never has a trailing slash.
 */
export const getApiBaseUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
  if (envUrl) return stripTrailingSlash(envUrl);
  return buildDefaultBaseUrl();
};

/**
 * Derive the WebSocket base URL from the API base URL by replacing the
 * http(s) scheme with the corresponding ws(s) scheme.
 *
 * Example: http://localhost:8001 → ws://localhost:8001
 *          https://api.example.com → wss://api.example.com
 */
export const getWebSocketUrl = (): string =>
  getApiBaseUrl().replace(/^http/, "ws");

/**
 * Full URL for the backend health-check endpoint.
 */
export const getHealthCheckUrl = (): string => `${getApiBaseUrl()}/api/health`;
