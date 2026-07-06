export async function initMobileRuntime(
  isDev: boolean,
): Promise<() => void> {
  // Web uses the same offline-first stack (SQLite queue, network store), so it
  // needs the network listener and sync scheduler too — without them, queued
  // counts on web only flush via a manual sync tap.
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
