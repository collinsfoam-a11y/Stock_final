import { Platform } from "react-native";

export async function initMobileRuntime(
  isDev: boolean,
): Promise<() => void> {
  if (Platform.OS === "web") {
    return () => {};
  }

  const [
    { initializeNetworkListener },
    { initializeSyncService },
    { startOfflineQueue, stopOfflineQueue },
    { startSyncService, stopSyncService },
    { default: apiClient },
  ] = await Promise.all([
    import("../services/networkService"),
    import("../services/syncService"),
    import("../services/offlineQueue"),
    import("../services/offline/syncService"),
    import("../services/httpClient"),
  ]);

  const networkUnsubscribe = initializeNetworkListener();
  const syncService = initializeSyncService();

  try {
    startOfflineQueue(apiClient);
    startSyncService();
  } catch (e) {
    if (isDev) {
      console.warn("Offline queue start failed:", e);
    }
  }

  return () => {
    networkUnsubscribe();
    syncService.cleanup();
    stopSyncService();
    try {
      stopOfflineQueue();
    } catch {
      // Best-effort cleanup.
    }
  };
}

