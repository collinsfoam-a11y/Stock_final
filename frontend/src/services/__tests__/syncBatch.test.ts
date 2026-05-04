jest.mock("../httpClient", () => ({
  __esModule: true,
  default: {
    defaults: {
      headers: {
        common: {},
        post: { "Content-Type": "application/json" },
        put: { "Content-Type": "application/json" },
        patch: { "Content-Type": "application/json" },
      },
    },
  },
  API_BASE_URL: "http://localhost:8001",
  updateBaseURL: jest.fn(),
}));

jest.mock("../connectionManager", () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => ({
      isHealthy: true,
      backendUrl: "http://mock:8001",
      backendPort: 8001,
      backendIp: "mock",
      lastChecked: new Date().toISOString(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
    })),
  },
  ConnectionManager: {
    getInstance: jest.fn(() => ({
      isHealthy: true,
      backendUrl: "http://mock:8001",
      backendPort: 8001,
      backendIp: "mock",
      lastChecked: new Date().toISOString(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
    })),
  },
}));

jest.mock("../../store/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      isAuthenticated: true,
      user: { username: "e2e", role: "staff" },
    }),
  },
}));
jest.mock("../../store/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({
      settings: {
        offlineMode: false,
        autoSyncEnabled: true,
        syncOnReconnect: true,
      },
    }),
  },
}));
jest.mock(
  "@react-native-async-storage/async-storage",
  () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@react-native-async-storage/async-storage/jest/async-storage-mock")
      .default,
);

// Mock API functions before importing syncService
jest.mock("../api/api", () => ({
  isOnline: jest.fn(),
  syncBatch: jest.fn(),
}));

// Mock offline storage before importing syncService
jest.mock("../offline/offlineStorage", () => ({
  getOfflineQueue: jest.fn(),
  getCacheStats: jest.fn(),
  removeManyFromOfflineQueue: jest.fn(),
  removeSessionFromCache: jest.fn(),
  updateOfflineQueueItem: jest.fn(),
  updateQueueItemRetries: jest.fn(),
}));

// Now import the function under test
// eslint-disable-next-line import/first
import { initializeSyncService, syncOfflineQueue } from "../syncService";
// eslint-disable-next-line import/first
import * as api from "../api/api";
// eslint-disable-next-line import/first
import * as offlineStorage from "../offline/offlineStorage";
// eslint-disable-next-line import/first
import { useNetworkStore } from "../../store/networkStore";

const flushAsyncWork = async (iterations = 5) => {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
};

const mockQueueItems = [
  {
    id: "count_line:op_1",
    type: "count_line",
    data: {
      _id: "op_1",
      idempotency_key: "op_1",
      session_id: "sess_1",
      item_code: "ITEM001",
      counted_qty: 10,
      floor_no: "F1",
      rack_no: "R1",
      location_id: "LOC-1",
      serial_numbers: ["SN-1"],
      counted_at: "2023-01-01T00:00:00Z",
    },
    timestamp: "2023-01-01T00:00:00Z",
    retries: 0,
    status: "pending",
    idempotency_key: "op_1",
    last_error: null,
    last_attempted_at: null,
  },
];

describe("syncOfflineQueue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations
    (offlineStorage.getOfflineQueue as jest.Mock).mockResolvedValue(
      mockQueueItems,
    );
    (offlineStorage.getCacheStats as jest.Mock).mockResolvedValue({
      queuedOperations: 1,
    });
    (api.isOnline as jest.Mock).mockReturnValue(true);
    (api.syncBatch as jest.Mock).mockResolvedValue({
      results: [{ id: "op_1", success: true }],
    });
    (offlineStorage.removeManyFromOfflineQueue as jest.Mock).mockResolvedValue(
      undefined,
    );
    (offlineStorage.updateQueueItemRetries as jest.Mock).mockResolvedValue(
      undefined,
    );
    (offlineStorage.updateOfflineQueueItem as jest.Mock).mockResolvedValue(
      undefined,
    );
  });

  it("should sync canonical records from offline queue", async () => {
    const result = await syncOfflineQueue();

    // Verify API called with the backend records contract, never legacy operations.
    expect(api.syncBatch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          client_record_id: "op_1",
          session_id: "sess_1",
          location_id: "LOC-1",
          floor_id: "F1",
          rack_id: "R1",
          item_code: "ITEM001",
          verified_qty: 10,
          damaged_qty: 0,
          serial_numbers: ["SN-1"],
          status: "finalized",
        }),
      ],
      expect.stringMatching(/^offline-/),
    );

    // Verify success handling
    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    expect(offlineStorage.removeManyFromOfflineQueue).toHaveBeenCalledWith([
      "count_line:op_1",
    ]);
  });

  it("should handle an empty queue", async () => {
    (offlineStorage.getOfflineQueue as jest.Mock).mockResolvedValue([]);

    const result = await syncOfflineQueue();

    expect(api.syncBatch).not.toHaveBeenCalled();
    expect(result.total).toBe(0);
  });

  it("should keep unsupported offline items for manual review without calling batch sync", async () => {
    (offlineStorage.getOfflineQueue as jest.Mock).mockResolvedValue([
      {
        id: "session:offline_1",
        type: "session",
        data: { id: "offline_1", warehouse: "Main" },
        timestamp: "2023-01-01T00:00:00Z",
        retries: 0,
        status: "pending",
      },
    ]);

    const result = await syncOfflineQueue();

    expect(api.syncBatch).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(offlineStorage.updateOfflineQueueItem).toHaveBeenCalledWith(
      "session:offline_1",
      expect.objectContaining({
        status: "failed_manual_review",
        last_error: expect.stringContaining("Unsupported offline item type"),
      }),
    );
    expect(offlineStorage.removeManyFromOfflineQueue).not.toHaveBeenCalled();
  });

  it("should handle partial failures", async () => {
    (api.syncBatch as jest.Mock).mockResolvedValue({
      results: [{ id: "op_1", success: false, message: "Duplicate record" }],
    });

    const result = await syncOfflineQueue();

    expect(result.failed).toBe(1);
    expect(result.success).toBe(0);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        id: "count_line:op_1",
        error: "Duplicate record",
      }),
    );
    // Should NOT remove failed items
    expect(offlineStorage.removeManyFromOfflineQueue).not.toHaveBeenCalled();
    // Should preserve failed items with explicit retry metadata
    expect(offlineStorage.updateQueueItemRetries).toHaveBeenCalledWith(
      "count_line:op_1",
      expect.objectContaining({
        error: "Duplicate record",
        status: "blocked_conflict",
      }),
    );
  });

  it("should preserve repeated failures for manual review instead of deleting them", async () => {
    (offlineStorage.getOfflineQueue as jest.Mock).mockResolvedValue([
      {
        ...mockQueueItems[0],
        retries: 4,
        status: "pending_retry",
      },
    ]);
    (api.syncBatch as jest.Mock).mockResolvedValue({
      results: [{ id: "op_1", success: false, message: "Server timeout" }],
    });

    const result = await syncOfflineQueue();

    expect(result.failed).toBe(1);
    expect(offlineStorage.updateQueueItemRetries).toHaveBeenCalledWith(
      "count_line:op_1",
      expect.objectContaining({
        error: "Server timeout",
        status: "failed_manual_review",
      }),
    );
    expect(offlineStorage.removeManyFromOfflineQueue).not.toHaveBeenCalled();
  });

  it("should report auth retries as failed work instead of a clean sync", async () => {
    const authError = Object.assign(new Error("Unauthorized"), {
      response: { status: 401 },
    });
    (api.syncBatch as jest.Mock).mockRejectedValue(authError);

    const result = await syncOfflineQueue();

    expect(result.failed).toBe(1);
    expect(result.errors).toContainEqual({
      id: "count_line:op_1",
      error: "Unauthorized",
    });
    expect(offlineStorage.updateOfflineQueueItem).toHaveBeenCalledWith(
      "count_line:op_1",
      expect.objectContaining({
        status: "pending_retry",
        last_error: "Unauthorized",
      }),
    );
    expect(offlineStorage.removeManyFromOfflineQueue).not.toHaveBeenCalled();
  });

  it("should not sync when offline", async () => {
    (api.isOnline as jest.Mock).mockReturnValue(false);

    const result = await syncOfflineQueue();

    expect(api.syncBatch).not.toHaveBeenCalled();
    expect(result.total).toBe(0);
  });
});

describe("initializeSyncService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (offlineStorage.getOfflineQueue as jest.Mock).mockResolvedValue(
      mockQueueItems,
    );
    (offlineStorage.getCacheStats as jest.Mock).mockResolvedValue({
      queuedOperations: 1,
    });
    (offlineStorage.removeManyFromOfflineQueue as jest.Mock).mockResolvedValue(
      undefined,
    );
    (offlineStorage.updateQueueItemRetries as jest.Mock).mockResolvedValue(
      undefined,
    );
    (offlineStorage.updateOfflineQueueItem as jest.Mock).mockResolvedValue(
      undefined,
    );
    (api.isOnline as jest.Mock).mockReturnValue(true);
    (api.syncBatch as jest.Mock).mockResolvedValue({
      results: [{ id: "op_1", success: true }],
    });
    useNetworkStore.setState({
      isOnline: false,
      connectionType: "unknown",
      isInternetReachable: null,
      isRestrictedMode: false,
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("should reuse one active subscription across repeated initialization", async () => {
    const first = initializeSyncService();
    const second = initializeSyncService();

    useNetworkStore.setState({ isOnline: true });
    jest.advanceTimersByTime(2000);
    await flushAsyncWork();

    expect(api.syncBatch).toHaveBeenCalledTimes(1);

    first.cleanup();
    second.cleanup();
  });

  it("should cancel pending reconnect work during cleanup", async () => {
    const syncService = initializeSyncService();

    useNetworkStore.setState({ isOnline: true });
    syncService.cleanup();
    jest.advanceTimersByTime(2000);
    await flushAsyncWork();

    expect(api.syncBatch).not.toHaveBeenCalled();
  });
});
