/**
 * Network State Detection Utilities
 *
 * Provides three-state network model for reliable offline-first logic.
 * Addresses the issue where unknown network state defaults to online.
 */

import { useNetworkStore } from "../store/networkStore";

/**
 * Three-state network status
 * - ONLINE: Confirmed network + backend connectivity
 * - OFFLINE: Confirmed no network
 * - UNKNOWN: Network state is indeterminate
 */
export type NetworkStatus = "ONLINE" | "OFFLINE" | "UNKNOWN";

/**
 * Network check result with detailed status
 */
export interface NetworkCheckResult {
  status: NetworkStatus;
  isOnline: boolean;
  isInternetReachable: boolean | null;
  connectionType: string;
  shouldAttemptApi: boolean;
  shouldAllowWrites: boolean;
}

/**
 * Get detailed network status with three-state model.
 * Use this for operations that need to understand network nuance.
 */
export function getNetworkStatus(): NetworkCheckResult {
  const state = useNetworkStore.getState();
  const { isOnline, isInternetReachable, connectionType, isRestrictedMode } =
    state;

  let status: NetworkStatus;

  const connectionInfo = (() => {
    try {
      // Dynamic import / inline requirement for ConnectionManager to avoid circular imports
      const ConnectionManager = require("../services/connectionManager").default;
      return ConnectionManager.getInstance().getConnectionInfo();
    } catch {
      return null;
    }
  })();

  const isBackendHealthy = connectionInfo?.isHealthy === true;

  // Determine three-state status. Branches are ordered by precedence, and every
  // branch assigns `status` exactly once: a standalone `if` before this chain
  // would be silently overwritten by it.
  if (isRestrictedMode) {
    // The backend has told us we're outside the allowed LAN, so treat as offline.
    // This is distinct from "no internet": the device may be connected, and the
    // backend may even be healthy, but policy forbids reaching it. This must take
    // precedence over every other signal, including isBackendHealthy.
    status = "OFFLINE";
  } else if (isBackendHealthy) {
    status = "ONLINE";
  } else if (isOnline === undefined || isOnline === null) {
    status = typeof window !== "undefined" && navigator.onLine ? "ONLINE" : "UNKNOWN";
  } else if (!isOnline) {
    status = "OFFLINE";
  } else if (isInternetReachable === false) {
    status = "OFFLINE";
  } else if (isInternetReachable === null || isInternetReachable === undefined) {
    // Connected to a network, but reachability is unconfirmed and the backend is
    // not known-healthy. Indeterminate, not online: writes stay blocked.
    status = "UNKNOWN";
  } else {
    status = "ONLINE";
  }

  // Determine behavior flags based on status
  const shouldAttemptApi = status !== "OFFLINE";
  // For writes, be conservative - only allow if definitively online
  const shouldAllowWrites = status === "ONLINE";

  return {
    status,
    isOnline: isOnline ?? false,
    isInternetReachable,
    connectionType,
    shouldAttemptApi,
    shouldAllowWrites,
  };
}

/**
 * Simple boolean check for "is definitively online".
 * Treats UNKNOWN as OFFLINE for safety (conservative approach).
 *
 * Use this for write operations where you need certainty.
 */
export function isDefinitelyOnline(): boolean {
  const { status } = getNetworkStatus();
  return status === "ONLINE";
}

/**
 * Check if we should attempt API calls.
 * More lenient - will attempt if not definitely offline.
 *
 * Use this for read operations where cache fallback exists.
 */
export function shouldAttemptApiCall(): boolean {
  const { status } = getNetworkStatus();
  return status !== "OFFLINE";
}

/**
 * Check if we're definitively offline.
 *
 * Use this to skip API calls entirely when we know it will fail.
 */
export function isDefinitelyOffline(): boolean {
  const { status } = getNetworkStatus();
  return status === "OFFLINE";
}

/**
 * Check if network state is unknown/indeterminate.
 *
 * Use this to show appropriate UI warnings.
 */
export function isNetworkUnknown(): boolean {
  const { status } = getNetworkStatus();
  return status === "UNKNOWN";
}

/**
 * Legacy compatibility: isOnline function
 *
 * @deprecated Use getNetworkStatus() or isDefinitelyOnline() for better semantics
 */
export function isOnline(): boolean {
  // For backward compatibility, maintain the old behavior:
  // - Attempt API calls unless definitely offline
  // This matches the existing shouldAttemptApiCall logic
  return shouldAttemptApiCall();
}
