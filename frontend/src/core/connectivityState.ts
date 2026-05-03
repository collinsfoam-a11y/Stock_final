import { createLogger } from "@/services/logging";
import { getNetworkStatus } from "@/utils/network";

export type ConnectivityState = "ONLINE" | "OFFLINE" | "SYNCING" | "UNKNOWN";
export type WritePolicyDecision = "DIRECT" | "ENQUEUE" | "BLOCK";

const log = createLogger("ConnectivityState");
let syncReplayInProgress = false;
let lastResolvedState: ConnectivityState | null = null;

const resolveBaseConnectivityState = (): ConnectivityState => {
  const status = getNetworkStatus().status;
  if (status === "ONLINE") return "ONLINE";
  if (status === "OFFLINE") return "OFFLINE";
  return "UNKNOWN";
};

/**
 * Sync replay lock used to prevent direct writes while queued operations are
 * actively being replayed.
 */
export const setSyncReplayInProgress = (inProgress: boolean): void => {
  if (syncReplayInProgress === inProgress) {
    return;
  }

  syncReplayInProgress = inProgress;
  log.debug("Sync replay mode updated", {
    syncReplayInProgress,
  });
};

/**
 * Canonical connectivity mapping for runtime decisions.
 * - ONLINE: safe for direct writes
 * - OFFLINE: queue writes
 * - SYNCING: replaying queue; queue new writes
 * - UNKNOWN: block writes until resolved
 */
export const getConnectivityState = (): ConnectivityState => {
  const baseState = resolveBaseConnectivityState();
  const resolvedState =
    syncReplayInProgress && baseState !== "OFFLINE" ? "SYNCING" : baseState;

  if (resolvedState !== lastResolvedState) {
    log.info("Connectivity state transition", {
      from: lastResolvedState,
      to: resolvedState,
      networkStatus: getNetworkStatus().status,
      syncReplayInProgress,
    });
    lastResolvedState = resolvedState;
  }

  return resolvedState;
};

export const getWritePolicyDecision = (): WritePolicyDecision => {
  const state = getConnectivityState();
  if (state === "ONLINE") {
    return "DIRECT";
  }
  if (state === "OFFLINE" || state === "SYNCING") {
    return "ENQUEUE";
  }
  return "BLOCK";
};

export const canAttemptLiveApi = (): boolean => getConnectivityState() !== "OFFLINE";

export const shouldForceOfflineWrites = (): boolean => getWritePolicyDecision() === "ENQUEUE";
