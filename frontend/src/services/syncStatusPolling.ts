import { createLogger } from "./logging";
import { getSyncStatus } from "./syncService";

const log = createLogger("syncStatusPolling");
const POLL_INTERVAL_MS = 5000;

export type SyncStatusSnapshot = Awaited<ReturnType<typeof getSyncStatus>>;
type SyncStatusSubscriber = (status: SyncStatusSnapshot) => void;

const subscribers = new Set<SyncStatusSubscriber>();
let pollInterval: ReturnType<typeof setInterval> | null = null;
let inFlightStatusRequest: Promise<SyncStatusSnapshot | null> | null = null;
let lastStatus: SyncStatusSnapshot | null = null;

const notifySubscribers = (status: SyncStatusSnapshot): void => {
  subscribers.forEach((subscriber) => {
    try {
      subscriber(status);
    } catch (error) {
      log.warn("Sync status subscriber threw an error", { error: String(error) });
    }
  });
};

const loadSyncStatus = async (): Promise<SyncStatusSnapshot | null> => {
  if (inFlightStatusRequest) {
    return inFlightStatusRequest;
  }

  inFlightStatusRequest = getSyncStatus()
    .then((status) => {
      lastStatus = status;
      notifySubscribers(status);
      return status;
    })
    .catch((error) => {
      log.warn("Failed to load sync status", { error: String(error) });
      return null;
    })
    .finally(() => {
      inFlightStatusRequest = null;
    });

  return inFlightStatusRequest;
};

const startPollingIfNeeded = (): void => {
  if (pollInterval || subscribers.size === 0) {
    return;
  }

  void loadSyncStatus();
  pollInterval = setInterval(() => {
    void loadSyncStatus();
  }, POLL_INTERVAL_MS);
};

const stopPollingIfIdle = (): void => {
  if (subscribers.size > 0 || !pollInterval) {
    return;
  }
  clearInterval(pollInterval);
  pollInterval = null;
};

export const subscribeSyncStatus = (
  subscriber: SyncStatusSubscriber,
): (() => void) => {
  subscribers.add(subscriber);

  if (lastStatus) {
    subscriber(lastStatus);
  }

  startPollingIfNeeded();

  return () => {
    subscribers.delete(subscriber);
    stopPollingIfIdle();
  };
};

export const refreshSyncStatus = async (): Promise<SyncStatusSnapshot | null> => {
  return loadSyncStatus();
};

export const getSyncStatusPollingMetrics = () => ({
  subscribers: subscribers.size,
  isPolling: pollInterval !== null,
  hasCachedStatus: lastStatus !== null,
  pollIntervalMs: POLL_INTERVAL_MS,
});

export const __resetSyncStatusPollingForTests = (): void => {
  subscribers.clear();
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  inFlightStatusRequest = null;
  lastStatus = null;
};
