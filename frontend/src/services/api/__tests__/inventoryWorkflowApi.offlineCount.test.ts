import { checkItemScanStatus, createCountLine, getCountLines } from "../inventoryWorkflowApi";
import * as sessionManagementApi from "../sessionManagementApi";
import * as connectivityState from "../../../core/connectivityState";
import * as offlineCountLineService from "../../offline/offlineCountLine";
import * as offlineStorage from "../../offline/offlineStorage";
import httpClient from "../../httpClient";

jest.mock("../../../utils/uuid", () => ({
  generateUUID: jest.fn(() => "idem-123"),
}));

jest.mock("../../logging", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock("../../httpClient", () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

jest.mock("../../../store/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      user: { username: "staff1", role: "staff" },
    }),
  },
}));

jest.mock("../../../core/connectivityState", () => ({
  getConnectivityState: jest.fn(() => "OFFLINE"),
  getWritePolicyDecision: jest.fn(() => "ENQUEUE"),
}));

describe("createCountLine offline queueing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(sessionManagementApi, "isOnline").mockReturnValue(false);
    jest.spyOn(sessionManagementApi, "shouldAttemptReadApi").mockReturnValue(false);
    (connectivityState.getConnectivityState as jest.Mock).mockReturnValue("OFFLINE");
    (connectivityState.getWritePolicyDecision as jest.Mock).mockReturnValue("ENQUEUE");
    jest.spyOn(offlineStorage, "getItemFromCache").mockResolvedValue(null as any);
    jest.spyOn(offlineStorage, "addToOfflineQueue").mockResolvedValue({} as any);
    jest.spyOn(offlineStorage, "cacheCountLine").mockResolvedValue({} as any);
    jest.spyOn(offlineCountLineService, "createOfflineCountLine").mockResolvedValue({
      _id: "offline-count-1",
      idempotency_key: "offline-count-1",
      session_id: "offline_session_1",
      item_code: "ITEM001",
      item_name: "Offline Item",
      counted_qty: 3,
      counted_by: "staff1",
      counted_at: new Date().toISOString(),
      cached_at: new Date().toISOString(),
      audit: {
        source: "scan_screen",
        device_id: null,
        app_version: null,
        created_offline: true,
        offline_created_at: new Date().toISOString(),
        sync_status: "pending",
        idempotency_key: "offline-count-1",
      },
    } as any);
  });

  it("creates a single offline queue operation for one offline count", async () => {
    const result = await createCountLine({
      session_id: "offline_session_1",
      item_code: "ITEM001",
      counted_qty: 3,
      rack_no: "A1",
    });

    expect(result._offline).toBe(true);
    expect(offlineCountLineService.createOfflineCountLine).toHaveBeenCalledTimes(1);
    expect(offlineStorage.addToOfflineQueue).not.toHaveBeenCalled();
    expect(offlineStorage.cacheCountLine).not.toHaveBeenCalled();
  });

  it("submits count line directly when connectivity is ONLINE", async () => {
    jest.spyOn(sessionManagementApi, "isOnline").mockReturnValue(true);
    (connectivityState.getConnectivityState as jest.Mock).mockReturnValue("ONLINE");
    (connectivityState.getWritePolicyDecision as jest.Mock).mockReturnValue("DIRECT");
    (httpClient.post as jest.Mock).mockResolvedValue({
      data: {
        _id: "line-online-1",
        session_id: "session-1",
        item_code: "ITEM001",
        counted_qty: 3,
      },
    });

    const response = await createCountLine({
      session_id: "session-1",
      item_code: "ITEM001",
      counted_qty: 3,
      rack_no: "A1",
    });

    expect(httpClient.post).toHaveBeenCalledWith(
      "/api/count-lines",
      expect.objectContaining({ session_id: "session-1", item_code: "ITEM001" }),
      expect.anything()
    );
    expect(response._source).toBe("api");
    expect(offlineCountLineService.createOfflineCountLine).not.toHaveBeenCalled();
  });

  it("replaces placeholder item names with cached ERP names for offline creation", async () => {
    jest.spyOn(offlineStorage, "getItemFromCache").mockResolvedValue({
      item_code: "ITEM001",
      item_name: "Soap Bar",
      cached_at: new Date().toISOString(),
    } as any);

    await createCountLine({
      session_id: "offline_session_1",
      item_code: "ITEM001",
      item_name: "ITEM001",
      counted_qty: 3,
      rack_no: "A1",
    });

    expect(offlineCountLineService.createOfflineCountLine).toHaveBeenCalledWith(
      expect.objectContaining({
        item_name: "ITEM001",
      }),
      expect.objectContaining({
        itemName: "Soap Bar",
      }),
    );
  });

  it("does not merge paginated API count lines into the offline cache", async () => {
    jest.spyOn(sessionManagementApi, "isOnline").mockReturnValue(true);
    jest.spyOn(sessionManagementApi, "shouldAttemptReadApi").mockReturnValue(true);
    jest.spyOn(offlineStorage, "cacheCountLines").mockResolvedValue(undefined as any);
    (httpClient.get as jest.Mock).mockResolvedValue({
      data: {
        items: [
          {
            id: "line-1",
            session_id: "session-1",
            item_code: "ITEM001",
            item_name: "Soap Bar",
            verified: true,
          },
        ],
        pagination: {
          page: 1,
          page_size: 50,
          total: 1,
          total_pages: 1,
          has_next: false,
          has_prev: false,
        },
      },
    });

    await getCountLines("session-1");

    expect(offlineStorage.cacheCountLines).not.toHaveBeenCalled();
  });

  it("attempts live count-line reads when network status is unknown", async () => {
    jest.spyOn(sessionManagementApi, "isOnline").mockReturnValue(false);
    jest.spyOn(sessionManagementApi, "shouldAttemptReadApi").mockReturnValue(true);
    (httpClient.get as jest.Mock).mockResolvedValue({
      data: {
        items: [
          {
            id: "line-1",
            session_id: "session-1",
            item_code: "ITEM001",
            item_name: "Soap Bar",
            verified: false,
          },
        ],
        pagination: {
          page: 1,
          page_size: 50,
          total: 1,
          total_pages: 1,
          has_next: false,
          has_prev: false,
        },
      },
    });

    const response = await getCountLines("session-1");

    expect(httpClient.get).toHaveBeenCalledWith(
      "/api/count-lines/session/session-1?page=1&page_size=50"
    );
    expect(response._source).toBe("api");
    expect(response.items[0]?.item_name).toBe("Soap Bar");
  });

  it("does not silently fallback to offline on online network failure", async () => {
    jest.spyOn(sessionManagementApi, "isOnline").mockReturnValue(true);
    (connectivityState.getConnectivityState as jest.Mock).mockReturnValue("ONLINE");
    (connectivityState.getWritePolicyDecision as jest.Mock).mockReturnValue("DIRECT");
    (httpClient.post as jest.Mock).mockRejectedValue(new Error("Network down"));

    await expect(
      createCountLine({
        session_id: "session-1",
        item_code: "ITEM001",
        counted_qty: 3,
        rack_no: "A1",
      })
    ).rejects.toThrow("Network down");

    expect(httpClient.post).toHaveBeenCalledWith(
      "/api/count-lines",
      expect.objectContaining({ idempotency_key: "idem-123" }),
      expect.anything(),
    );
    expect(offlineCountLineService.createOfflineCountLine).not.toHaveBeenCalled();
  });

  it("blocks writes when connectivity is UNKNOWN", async () => {
    (connectivityState.getConnectivityState as jest.Mock).mockReturnValue("UNKNOWN");
    (connectivityState.getWritePolicyDecision as jest.Mock).mockReturnValue("BLOCK");

    await expect(
      createCountLine({
        session_id: "session-1",
        item_code: "ITEM001",
        counted_qty: 1,
        rack_no: "A1",
      })
    ).rejects.toThrow("Connectivity is still being determined");

    expect(httpClient.post).not.toHaveBeenCalled();
    expect(offlineCountLineService.createOfflineCountLine).not.toHaveBeenCalled();
  });

  it("queues writes during SYNCING without direct API calls", async () => {
    (connectivityState.getConnectivityState as jest.Mock).mockReturnValue("SYNCING");
    (connectivityState.getWritePolicyDecision as jest.Mock).mockReturnValue("ENQUEUE");

    const response = await createCountLine({
      session_id: "session-1",
      item_code: "ITEM001",
      counted_qty: 1,
      rack_no: "A1",
    });

    expect(response._offline).toBe(true);
    expect(offlineCountLineService.createOfflineCountLine).toHaveBeenCalledTimes(1);
    expect(httpClient.post).not.toHaveBeenCalled();
  });

  it("hydrates only the current offline page instead of the full cached session", async () => {
    jest.spyOn(sessionManagementApi, "isOnline").mockReturnValue(false);
    jest.spyOn(offlineStorage, "getCountLinesBySessionFromCache").mockResolvedValue([
      {
        _id: "line-1",
        session_id: "session-1",
        item_code: "ITEM001",
        item_name: "ITEM001",
        counted_qty: 1,
        counted_by: "staff1",
        counted_at: new Date().toISOString(),
        cached_at: new Date().toISOString(),
      },
      {
        _id: "line-2",
        session_id: "session-1",
        item_code: "ITEM002",
        item_name: "ITEM002",
        counted_qty: 2,
        counted_by: "staff1",
        counted_at: new Date().toISOString(),
        cached_at: new Date().toISOString(),
      },
    ] as any);
    jest
      .spyOn(offlineStorage, "getItemFromCache")
      .mockResolvedValueOnce({
        item_code: "ITEM001",
        item_name: "Soap Bar",
        cached_at: new Date().toISOString(),
      } as any);

    const response = await getCountLines("session-1", 1, 1);

    expect(response.items).toHaveLength(1);
    expect(response.items[0]?.item_name).toBe("Soap Bar");
    expect(offlineStorage.getItemFromCache).toHaveBeenCalledTimes(1);
    expect(offlineStorage.getItemFromCache).toHaveBeenCalledWith("ITEM001");
  });

  it("falls back quietly when live scan status lookup is unavailable", async () => {
    jest.spyOn(sessionManagementApi, "shouldAttemptReadApi").mockReturnValue(true);
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    (httpClient.get as jest.Mock).mockRejectedValue(new Error("Network Error"));

    try {
      const response = await checkItemScanStatus("session/1", "ITEM/001");

      expect(httpClient.get).toHaveBeenCalledWith(
        "/api/sessions/session%2F1/items/ITEM%2F001/scan-status"
      );
      expect(response).toEqual({ scanned: false, total_qty: 0, locations: [] });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
