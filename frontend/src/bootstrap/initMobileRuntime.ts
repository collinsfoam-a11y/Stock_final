import { Platform } from "react-native";

export async function initMobileRuntime(
  isDev: boolean,
): Promise<() => void> {
  if (Platform.OS === "web") {
    return () => {};
  }

  const [
    { initializeNetworkListener },
    { initializeSyncService, startSyncService, stopSyncService },
  ] = await Promise.all([
    import("../services/networkService"),
    import("../services/syncService"),
  ]);

  const networkUnsubscribe = initializeNetworkListener();
  const syncService = initializeSyncService();

  try {
    startSyncService();
  } catch (e) {
    if (isDev) {
      console.warn("Offline sync start failed:", e);
    }
  }

  return () => {
    networkUnsubscribe();
    syncService.cleanup();
    stopSyncService();
  };
}
