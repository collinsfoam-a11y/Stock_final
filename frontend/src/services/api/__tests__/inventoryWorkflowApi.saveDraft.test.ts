import { finalizeSession, saveDraft, updateSessionStatus } from "../inventoryWorkflowApi";
import * as sessionManagementApi from "../sessionManagementApi";
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
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

jest.mock("../sessionManagementApi", () => ({
  __esModule: true,
  finalizeSession: jest.fn(),
  isOnline: jest.fn(),
  shouldAttemptReadApi: jest.fn(),
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

describe("saveDraft", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not post autosave drafts for offline sessions", async () => {
    (sessionManagementApi.isOnline as jest.Mock).mockReturnValue(true);

    const result = await saveDraft({
      session_id: "offline_3218ea5d-6218-4f8a-81ca-b5233bb298a3",
      item_code: "5204",
      item_name: "Test Item",
      counted_qty: 1,
    });

    expect(result).toBeNull();
    expect(httpClient.post).not.toHaveBeenCalled();
  });

  it("posts autosave drafts for server sessions while online", async () => {
    (sessionManagementApi.isOnline as jest.Mock).mockReturnValue(true);
    (httpClient.post as jest.Mock).mockResolvedValue({ data: { success: true } });

    const result = await saveDraft({
      session_id: "session-live",
      item_code: "5204",
      item_name: "Test Item",
      counted_qty: 1,
    });

    expect(httpClient.post).toHaveBeenCalledWith("/api/count-lines/draft", {
      session_id: "session-live",
      item_code: "5204",
      item_name: "Test Item",
      counted_qty: 1,
    });
    expect(result).toEqual({ success: true });
  });

  it("delegates session status updates to sessionManagementApi", async () => {
    (sessionManagementApi.updateSessionStatus as jest.Mock).mockResolvedValue({
      source: "session-management",
    });

    const result = await updateSessionStatus("offline_session_1", "reconcile");

    expect(sessionManagementApi.updateSessionStatus).toHaveBeenCalledWith(
      "offline_session_1",
      "reconcile"
    );
    expect(httpClient.put).not.toHaveBeenCalled();
    expect(result).toEqual({ source: "session-management" });
  });

  it("delegates finalization to sessionManagementApi", async () => {
    (sessionManagementApi.finalizeSession as jest.Mock).mockResolvedValue({
      source: "session-management",
    });

    const result = await finalizeSession("offline_session_1", { note: "done" });

    expect(sessionManagementApi.finalizeSession).toHaveBeenCalledWith("offline_session_1", {
      note: "done",
    });
    expect(httpClient.post).not.toHaveBeenCalled();
    expect(result).toEqual({ source: "session-management" });
  });
});
