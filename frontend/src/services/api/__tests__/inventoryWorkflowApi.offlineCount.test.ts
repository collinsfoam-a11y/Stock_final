import { createCountLine } from "../inventoryWorkflowApi";
import * as sessionManagementApi from "../sessionManagementApi";
import * as offlineCountLineService from "../../offline/offlineCountLine";
import * as offlineStorage from "../../offline/offlineStorage";
import httpClient from "../../httpClient";

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

describe("createCountLine offline queueing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(sessionManagementApi, "isOnline").mockReturnValue(false);
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

    const { getCountLines } = await import("../inventoryWorkflowApi");
    await getCountLines("session-1");

    expect(offlineStorage.cacheCountLines).not.toHaveBeenCalled();
  });
});
