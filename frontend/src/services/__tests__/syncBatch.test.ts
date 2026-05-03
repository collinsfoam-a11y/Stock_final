jest.mock("../httpClient", () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
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
    require("@react-native-async-storage/async-storage/jest/async-storage-mock").default
);

// Mock API functions before importing syncService
jest.mock("../api/api", () => ({
  isOnline: jest.fn(),
  syncBatch: jest.fn(),
}));

// Mock offline storage before importing syncService
jest.mock("../offline/offlineStorage", () => ({
  appendReplayAuditEntry: jest.fn(),
  getOfflineQueue: jest.fn(),
  getCacheStats: jest.fn(),
  cacheSession: jest.fn(),
  getMappedSessionId: jest.fn(),
  removeManyFromOfflineQueue: jest.fn(),
  removeSessionFromCache: jest.fn(),
  setSessionIdMapping: jest.fn(),
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
// eslint-disable-next-line import/first
import apiClient from "../httpClient";

const flushAsyncWork = async (iterations = 5) => {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
};

const mockOperations = [
  {
    id: "op_1",
    type: "count_line",
    data: {
      session_id: "sess_1",
      location_id: "showroom",
      floor_id: "F1",
      rack_id: "R1",
      item_code: "ITEM001",
      counted_qty: 10,
      status: "SUBMITTED",
    },
    timestamp: "2023-01-01T00:00:00Z",
    retries: 0,
    status: "pending",
  },
];

describe("syncOfflineQueue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations
    (offlineStorage.getOfflineQueue as jest.Mock).mockResolvedValue(mockOperations);
    (offlineStorage.getCacheStats as jest.Mock).mockResolvedValue({
      queuedOperations: 1,
    });
    (api.isOnline as jest.Mock).mockReturnValue(true);
    (api.syncBatch as jest.Mock).mockResolvedValue({
      results: [{ id: "op_1", success: true }],
    });
    (offlineStorage.removeManyFromOfflineQueue as jest.Mock).mockResolvedValue(undefined);
    (offlineStorage.updateQueueItemRetries as jest.Mock).mockResolvedValue(undefined);
    (offlineStorage.updateOfflineQueueItem as jest.Mock).mockResolvedValue(undefined);
    (offlineStorage.getMappedSessionId as jest.Mock).mockResolvedValue(null);
    (offlineStorage.cacheSession as jest.Mock).mockResolvedValue(undefined);
    (offlineStorage.setSessionIdMapping as jest.Mock).mockResolvedValue(undefined);
    (offlineStorage.appendReplayAuditEntry as jest.Mock).mockResolvedValue(undefined);
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: { id: "server-session-1", session_id: "server-session-1" },
    });
  });

  it("should sync count-line records from offline queue", async () => {
    const result = await syncOfflineQueue();

    expect(api.syncBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        record_id: "op_1",
        client_record_id: "op_1",
        session_id: "sess_1",
        location_id: "showroom",
        floor_id: "F1",
        rack_id: "R1",
        item_code: "ITEM001",
        verified_qty: 10,
      }),
    ]);

    // Verify success handling
    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    expect(offlineStorage.removeManyFromOfflineQueue).toHaveBeenCalledWith(["op_1"]);
    expect(offlineStorage.appendReplayAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        action_id: "op_1",
        success: true,
        retry_count: 0,
      })
    );
  });

  it("should sync queued sessions before dependent count-line records", async () => {
    const mockCountLine = mockOperations[0]!;
    (offlineStorage.getOfflineQueue as jest.Mock).mockResolvedValue([
      {
        id: "session:offline_sess_1",
        type: "session",
        data: {
          id: "offline_sess_1",
          warehouse: "Showroom - Ground - R1",
          location_type: "Showroom",
          location_name: "Ground",
          rack_no: "R1",
        },
        timestamp: "2023-01-01T00:00:00Z",
        retries: 0,
        status: "pending",
      },
      {
        ...mockCountLine,
        data: {
          ...mockCountLine.data,
          session_id: "offline_sess_1",
        },
      },
    ]);
    (offlineStorage.getMappedSessionId as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("server-session-1");

    const result = await syncOfflineQueue();

    expect(apiClient.post).toHaveBeenCalledWith(
      "/api/sessions",
      expect.objectContaining({
        client_session_id: "offline_sess_1",
        offline_id: "offline_sess_1",
      }),
      expect.objectContaining({ skipOfflineQueue: true })
    );
    expect(offlineStorage.setSessionIdMapping).toHaveBeenCalledWith(
      "offline_sess_1",
      "server-session-1"
    );
    expect(api.syncBatch).toHaveBeenCalledWith([
      expect.objectContaining({ session_id: "server-session-1" }),
    ]);
    expect(result.success).toBe(2);
  });

  it("should post unknown items directly to the unknown-items endpoint", async () => {
    (offlineStorage.getOfflineQueue as jest.Mock).mockResolvedValue([
      {
        id: "unknown:sess_1:999",
        type: "unknown_item",
        data: {
          session_id: "sess_1",
          location_id: "showroom",
          floor_id: "F1",
          rack_id: "R1",
          barcode: "999",
        },
        timestamp: "2023-01-01T00:00:00Z",
        retries: 0,
        status: "pending",
      },
    ]);

    const result = await syncOfflineQueue();

    expect(api.syncBatch).not.toHaveBeenCalled();
    expect(apiClient.post).toHaveBeenCalledWith(
      "/api/unknown-items",
      expect.objectContaining({
        session_id: "sess_1",
        location_id: "showroom",
        floor_id: "F1",
        rack_id: "R1",
      }),
      expect.objectContaining({ skipOfflineQueue: true })
    );
    expect(result.success).toBe(1);
  });

  it("should handle ignored operations (empty queue)", async () => {
    (offlineStorage.getOfflineQueue as jest.Mock).mockResolvedValue([]);

    const result = await syncOfflineQueue();

    expect(api.syncBatch).not.toHaveBeenCalled();
    expect(result.total).toBe(0);
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
        id: "op_1",
        error: "Duplicate record",
      })
    );
    // Should NOT remove failed items
    expect(offlineStorage.removeManyFromOfflineQueue).not.toHaveBeenCalled();
    // Should preserve failed items with explicit retry metadata
    expect(offlineStorage.updateQueueItemRetries).toHaveBeenCalledWith(
      "op_1",
      expect.objectContaining({
        error: "Duplicate record",
        status: "blocked_conflict",
      })
    );
  });

  it("should not synthesize location ids from warehouse or floor aliases", async () => {
    (offlineStorage.getOfflineQueue as jest.Mock).mockResolvedValue([
      {
        ...mockOperations[0],
        data: {
          session_id: "sess_1",
          warehouse: "showroom",
          floor: "F1",
          rack_id: "R1",
          item_code: "ITEM001",
          counted_qty: 10,
        },
      },
    ]);

    const result = await syncOfflineQueue();

    expect(api.syncBatch).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.error).toContain("Missing location_id");
    expect(offlineStorage.removeManyFromOfflineQueue).not.toHaveBeenCalled();
  });

  it("should preserve repeated failures for manual review instead of deleting them", async () => {
    (offlineStorage.getOfflineQueue as jest.Mock).mockResolvedValue([
      {
        ...mockOperations[0],
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
      "op_1",
      expect.objectContaining({
        error: "Server timeout",
        status: "failed_manual_review",
      })
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
      id: "op_1",
      error: "Unauthorized",
    });
    expect(offlineStorage.updateOfflineQueueItem).toHaveBeenCalledWith(
      "op_1",
      expect.objectContaining({
        status: "pending_retry",
        last_error: "Unauthorized",
      })
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
    (offlineStorage.getOfflineQueue as jest.Mock).mockResolvedValue(mockOperations);
    (offlineStorage.getCacheStats as jest.Mock).mockResolvedValue({
      queuedOperations: 1,
    });
    (offlineStorage.removeManyFromOfflineQueue as jest.Mock).mockResolvedValue(undefined);
    (offlineStorage.updateQueueItemRetries as jest.Mock).mockResolvedValue(undefined);
    (offlineStorage.updateOfflineQueueItem as jest.Mock).mockResolvedValue(undefined);
    (offlineStorage.appendReplayAuditEntry as jest.Mock).mockResolvedValue(undefined);
    (api.isOnline as jest.Mock).mockReturnValue(true);
    (api.syncBatch as jest.Mock).mockResolvedValue({
      results: [{ id: "op_1", success: true }],
    });
    (offlineStorage.getMappedSessionId as jest.Mock).mockResolvedValue(null);
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
