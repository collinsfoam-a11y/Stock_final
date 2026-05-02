import { getCountLines } from "../inventoryWorkflowApi";
import * as sessionManagementApi from "../sessionManagementApi";
import * as offlineStorage from "../../offline/offlineStorage";

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
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock("../sessionManagementApi", () => ({
  __esModule: true,
  finalizeSession: jest.fn(),
  isOnline: jest.fn(),
  shouldAttemptReadApi: jest.fn(() => false),
  updateSessionStatus: jest.fn(),
}));

jest.mock("../../control-plane/countLineControlPlane", () => {
  class ProjectionReadError extends Error {}
  return {
    __esModule: true,
    ProjectionReadError,
    getProjectedCountLinesForSession: jest.fn(async () => []),
    getProjectedScanStatusRead: jest.fn(async () => null),
    submitCountLineCommand: jest.fn(),
  };
});

jest.mock("../../control-plane/countLineReviewControlPlane", () => ({
  __esModule: true,
  approveCountLineCommand: jest.fn(),
  overlayCountLineReviewState: jest.fn(async (lines) => lines),
  rejectCountLineCommand: jest.fn(),
  unverifyStockCommand: jest.fn(),
  verifyStockCommand: jest.fn(),
}));

describe("getCountLines item name hydration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("hydrates cached count lines with ERP item names from item cache", async () => {
    jest.spyOn(sessionManagementApi, "isOnline").mockReturnValue(false);
    jest
      .spyOn(offlineStorage, "getCountLinesBySessionFromCache")
      .mockResolvedValue([
        {
          _id: "line-1",
          session_id: "session-1",
          item_code: "ITEM001",
          item_name: "ITEM001",
          counted_qty: 2,
          counted_by: "staff1",
          counted_at: "2026-03-21T12:00:00.000Z",
          cached_at: "2026-03-21T12:00:00.000Z",
        } as any,
      ]);
    jest.spyOn(offlineStorage, "getItemFromCache").mockResolvedValue({
      item_code: "ITEM001",
      item_name: "Soap Bar",
      cached_at: "2026-03-21T12:00:00.000Z",
    } as any);

    const result = await getCountLines("session-1");

    expect(result.items).toEqual([
      expect.objectContaining({
        item_code: "ITEM001",
        item_name: "Soap Bar",
      }),
    ]);
  });
});
