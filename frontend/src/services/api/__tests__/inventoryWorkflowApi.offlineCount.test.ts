import {
  approveCountLine,
  createCountLine,
  getCountLines,
  rejectCountLine,
  unverifyStock,
  verifyStock,
} from "../inventoryWorkflowApi";
import * as sessionManagementApi from "../sessionManagementApi";
import * as offlineStorage from "../../offline/offlineStorage";
import * as controlPlane from "../../control-plane/countLineControlPlane";
import * as reviewControlPlane from "../../control-plane/countLineReviewControlPlane";
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

jest.mock("../../control-plane/countLineControlPlane", () => ({
  submitCountLineCommand: jest.fn(),
  getProjectedCountLinesForSession: jest.fn(),
  getProjectedScanStatusRead: jest.fn(),
  ProjectionReadError: class ProjectionReadError extends Error {},
}));

jest.mock("../../control-plane/countLineReviewControlPlane", () => ({
  overlayCountLineReviewState: jest.fn(async (rows: any[]) => rows),
  approveCountLineCommand: jest.fn(),
  rejectCountLineCommand: jest.fn(),
  verifyStockCommand: jest.fn(),
  unverifyStockCommand: jest.fn(),
}));

describe("inventoryWorkflowApi control-plane integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(sessionManagementApi, "isOnline").mockReturnValue(false);
    jest.spyOn(sessionManagementApi, "shouldAttemptReadApi").mockReturnValue(false);
    jest.spyOn(offlineStorage, "getItemFromCache").mockResolvedValue(null as any);
    (controlPlane.getProjectedCountLinesForSession as jest.Mock).mockResolvedValue(null);
    (controlPlane.getProjectedScanStatusRead as jest.Mock).mockResolvedValue(null);
    (reviewControlPlane.overlayCountLineReviewState as jest.Mock).mockImplementation(
      async (rows: any[]) => rows
    );
    (controlPlane.submitCountLineCommand as jest.Mock).mockResolvedValue({
      _id: "cp-count-1",
      session_id: "offline_session_1",
      item_code: "ITEM001",
      counted_qty: 3,
      _offline: true,
      _source: "local",
    });
  });

  it("delegates count-line creation to the control-plane command executor", async () => {
    const payload = {
      session_id: "offline_session_1",
      item_code: "ITEM001",
      counted_qty: 3,
      rack_no: "A1",
    };

    const result = await createCountLine(payload);

    expect(controlPlane.submitCountLineCommand).toHaveBeenCalledWith({
      ...payload,
      idempotency_key: expect.any(String),
    });
    expect(result._offline).toBe(true);
  });

  it("preserves a caller-supplied idempotency key on the offline command path", async () => {
    const payload = {
      session_id: "offline_session_1",
      item_code: "ITEM001",
      counted_qty: 3,
      rack_no: "A1",
      idempotency_key: "bulk:offline_session_1:ITEM001:BATCH-A:3",
    };

    await createCountLine(payload);

    expect(controlPlane.submitCountLineCommand).toHaveBeenCalledWith(payload);
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
    jest.spyOn(offlineStorage, "getItemFromCache").mockResolvedValueOnce({
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

  it("applies projected review overlays before returning count-line reads", async () => {
    jest.spyOn(sessionManagementApi, "isOnline").mockReturnValue(true);
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
    (reviewControlPlane.overlayCountLineReviewState as jest.Mock).mockResolvedValue([
      {
        id: "line-1",
        session_id: "session-1",
        item_code: "ITEM001",
        item_name: "Soap Bar",
        verified: true,
      },
    ]);

    const response = await getCountLines("session-1", 1, 50, true);

    expect(reviewControlPlane.overlayCountLineReviewState).toHaveBeenCalled();
    expect(response.items).toHaveLength(1);
    expect(response.items[0]?.verified).toBe(true);
  });

  it("delegates supervisor review actions to the review control plane", async () => {
    (reviewControlPlane.approveCountLineCommand as jest.Mock).mockResolvedValue({ success: true });
    (reviewControlPlane.rejectCountLineCommand as jest.Mock).mockResolvedValue({ success: true });
    (reviewControlPlane.verifyStockCommand as jest.Mock).mockResolvedValue({ success: true });
    (reviewControlPlane.unverifyStockCommand as jest.Mock).mockResolvedValue({ success: true });

    await approveCountLine("line-1");
    await rejectCountLine("line-1", { notes: "Mismatch", assign_to: "staff2" });
    await verifyStock("line-1");
    await unverifyStock("line-1");

    expect(reviewControlPlane.approveCountLineCommand).toHaveBeenCalledWith("line-1", undefined);
    expect(reviewControlPlane.rejectCountLineCommand).toHaveBeenCalledWith("line-1", {
      notes: "Mismatch",
      assign_to: "staff2",
    });
    expect(reviewControlPlane.verifyStockCommand).toHaveBeenCalledWith("line-1");
    expect(reviewControlPlane.unverifyStockCommand).toHaveBeenCalledWith("line-1");
  });
});
