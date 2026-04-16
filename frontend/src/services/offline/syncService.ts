import { syncOfflineQueue } from "../syncService";
import { createLogger } from "../logging";
import { useSettingsStore } from "../../store/settingsStore";

const log = createLogger("offlineSyncService");
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let settingsUnsubscribe: (() => void) | null = null;

const getIntervalMs = (overrideIntervalMs?: number): number => {
  if (typeof overrideIntervalMs === "number") {
    return overrideIntervalMs;
  }

  const minutes = useSettingsStore.getState().settings.autoSyncInterval;
  return Math.max(5, minutes) * 60 * 1000;
};

const clearSyncInterval = () => {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
};

export function startSyncService(options?: {
  intervalMs?: number;
  runImmediately?: boolean;
}): void {
  const runImmediately = options?.runImmediately ?? true;

  const run = () => {
    syncOfflineQueue({ background: true }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      log.warn("Background sync failed", { error: message });
    });
  };

  const restart = (shouldRunImmediately: boolean) => {
    clearSyncInterval();

    const { autoSyncEnabled, offlineMode } = useSettingsStore.getState().settings;
    if (!autoSyncEnabled || offlineMode) {
      log.debug("Periodic sync disabled by user settings");
      return;
    }

    const intervalMs = getIntervalMs(options?.intervalMs) || DEFAULT_INTERVAL_MS;
    if (shouldRunImmediately) {
      run();
    }

    intervalId = setInterval(run, intervalMs);
    log.debug("Started periodic sync service", { intervalMs });
  };

  restart(runImmediately);

  if (!settingsUnsubscribe) {
    settingsUnsubscribe = useSettingsStore.subscribe(
      (state, previousState) => {
        const current = state.settings;
        const previous = previousState.settings;
        if (
          current.autoSyncEnabled === previous.autoSyncEnabled &&
          current.autoSyncInterval === previous.autoSyncInterval &&
          current.offlineMode === previous.offlineMode
        ) {
          return;
        }

        restart(
          current.autoSyncEnabled &&
            !current.offlineMode &&
            (!previous.autoSyncEnabled || previous.offlineMode),
        );
      },
    );
  }
}

export function stopSyncService(): void {
  clearSyncInterval();
  if (settingsUnsubscribe) {
    settingsUnsubscribe();
    settingsUnsubscribe = null;
  }
}
