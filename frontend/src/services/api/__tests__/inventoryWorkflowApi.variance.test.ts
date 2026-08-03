import api from "../../httpClient";
import { shouldAttemptReadApi } from "../sessionManagementApi";
import { getSessionSqlVariance } from "../inventoryWorkflowApi";

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
  shouldAttemptReadApi: jest.fn(),
}));

describe("getSessionSqlVariance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls the canonical SQL variance endpoint and returns the data", async () => {
    (shouldAttemptReadApi as jest.Mock).mockReturnValue(true);
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: {
          session_id: "sess-1",
          movement_adjusted_expected: 118,
          audit_delta: -5,
          operational_delta: -3,
          variance_by_item: [
            {
              item_code: "ITEM-001",
              sql_qty_at_submission: 120,
              physical_qty: 115,
              audit_delta: -5,
              operational_delta: -3,
            },
          ],
          computed_at: "2026-08-03T00:00:00Z",
        },
      },
    });

    const result = await getSessionSqlVariance("sess-1");

    expect(api.get).toHaveBeenCalledWith("/api/session/sess-1/sql");
    expect(result?.data?.variance_by_item).toHaveLength(1);
    const first = result?.data?.variance_by_item?.[0];
    expect(first?.item_code).toBe("ITEM-001");
  });

  it("returns null when offline (shouldAttemptReadApi is false)", async () => {
    (shouldAttemptReadApi as jest.Mock).mockReturnValue(false);

    const result = await getSessionSqlVariance("sess-1");

    expect(api.get).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("returns null when the API call fails", async () => {
    (shouldAttemptReadApi as jest.Mock).mockReturnValue(true);
    (api.get as jest.Mock).mockRejectedValue(new Error("Network error"));

    const result = await getSessionSqlVariance("sess-1");

    expect(result).toBeNull();
  });
});
