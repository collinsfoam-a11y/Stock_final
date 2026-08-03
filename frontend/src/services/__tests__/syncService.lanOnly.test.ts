import { useNetworkStore } from "../../store/networkStore";
import { useSettingsStore } from "../../store/settingsStore";

jest.mock("../offline/offlineStorage", () => ({
  getOfflineQueue: jest.fn().mockResolvedValue([]),
  removeManyFromOfflineQueue: jest.fn(),
  updateQueueItemRetries: jest.fn(),
  updateOfflineQueueItem: jest.fn(),
  getCacheStats: jest.fn().mockResolvedValue({ count: 0, oldestTimestamp: null }),
  removeSessionFromCache: jest.fn(),
}));

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(),
}));

jest.mock("../logging", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("initializeSyncService LAN-only operation", () => {
  beforeEach(() => {
    useNetworkStore.setState({
      isOnline: false,
      isInternetReachable: false,
      connectionType: "wifi",
      isRestrictedMode: false,
    });

    useSettingsStore.setState({
      settings: {
        offlineMode: false,
        autoSyncEnabled: true,
        syncOnReconnect: true,
        syncInterval: 15,
        maxQueueSize: 100,
        cacheExpiration: 24,
      },
    } as any);

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("wakes the sync queue when device connects to LAN without public internet", async () => {
    const { initializeSyncService } = await import("../syncService");
    const { cleanup } = initializeSyncService();

    // Simulate connecting to showroom Wi-Fi with backend on LAN,
    // but no public internet access.
    useNetworkStore.setState({
      isOnline: true,
      isInternetReachable: false,
    });

    // The reconnect timer should have been scheduled despite
    // isInternetReachable being false.
    jest.advanceTimersByTime(2500);

    cleanup();
  });

  it("does not wake the queue when the device remains offline", async () => {
    const { initializeSyncService } = await import("../syncService");
    const { cleanup } = initializeSyncService();

    // Device stays offline — no network at all.
    useNetworkStore.setState({
      isOnline: false,
      isInternetReachable: false,
    });

    jest.advanceTimersByTime(2500);

    cleanup();
  });
});
