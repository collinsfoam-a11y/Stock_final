import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useItemDetailData } from "../useItemDetailData";
import * as apiModule from "@/services/api/api";
import { toastService } from "@/services/toastService";

jest.mock("@/services/connectionManager", () => ({
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

jest.mock("@/services/api/api", () => ({
  getItemByIdentifier: jest.fn(),
  getItemVariants: jest.fn(),
  checkItemCounted: jest.fn(),
  checkItemScanStatus: jest.fn(),
  searchItems: jest.fn(),
}));

jest.mock("@/services/httpClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock("@/hooks/useWebSocket", () => ({
  __esModule: true,
  useWebSocket: jest.fn(() => ({ lastMessage: null })),
}));

jest.mock("@/services/toastService", () => ({
  toastService: {
    show: jest.fn(),
  },
}));

jest.mock("@/store/settingsStore", () => ({
  useSettingsStore: jest.fn(() => false),
}));

describe("useItemDetailData - ERP Refresh Functionality", () => {
  const mockOnBackPress = jest.fn();
  const mockOnMrpChange = jest.fn();
  const mockOnQuantityChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (apiModule.getItemByIdentifier as jest.Mock).mockResolvedValue({
      item_code: "ITEM_1",
      barcode: "BAR_1",
      stock_qty: 10,
      current_stock: 10,
      uom_name: "PCS",
    });
    const httpClient = require("@/services/httpClient");
    (httpClient.default.get as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("sets ERP Live status and lastErpRefresh on successful SQL verification", async () => {
    const httpClient = require("@/services/httpClient");
    (httpClient.default.get as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: {
          item_code: "ITEM_1",
          barcode: "BAR_1",
          stock_qty: 25,
          current_stock: 25,
          sql_available: true,
          quantity_source: "sql_verification",
          last_sql_verified_at: "2026-07-24T11:47:00+05:30",
          last_sync_at: "2026-07-24T11:47:00+05:30",
          uom_name: "PCS",
        },
      },
    });

    const { result } = renderHook(() =>
      useItemDetailData({ barcode: "BAR_1", onBackPress: mockOnBackPress, onMrpChange: mockOnMrpChange, onQuantityChange: mockOnQuantityChange })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleRefreshStock();
    });

    expect(toastService.show).toHaveBeenCalledWith("Stock refreshed from SQL", { type: "success" });
    expect(result.current.lastErpRefresh).toEqual({
      checkedAt: "2026-07-24T11:47:00+05:30",
      source: "sql_server",
      scope: "batch",
    });
    expect(result.current.item?.stock_qty).toBe(25);
    expect(result.current.item?._source).toBe("sql");
    expect(result.current.refreshStatus).toBe("success");
  });

  it("sets Cached status and updated toast when SQL is unavailable", async () => {
    const httpClient = require("@/services/httpClient");
    (httpClient.default.get as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: {
          item_code: "ITEM_1",
          barcode: "BAR_1",
          stock_qty: 10,
          current_stock: 10,
          sql_available: false,
          quantity_source: "sync_cache",
          last_sync_at: "2026-07-24T11:43:00+05:30",
          uom_name: "PCS",
        },
      },
    });

    const { result } = renderHook(() =>
      useItemDetailData({ barcode: "BAR_1", onBackPress: mockOnBackPress, onMrpChange: mockOnMrpChange, onQuantityChange: mockOnQuantityChange })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleRefreshStock();
    });

    expect(toastService.show).toHaveBeenCalledWith(
      "Unable to reach SQL Server. Displaying the last synchronized ERP quantity. Physical counting can continue.",
      { type: "warning" }
    );
    expect(result.current.lastErpRefresh).toEqual({
      checkedAt: "2026-07-24T11:43:00+05:30",
      source: "cached",
      scope: "batch",
    });
    expect(result.current.item?.stock_qty).toBe(10);
    expect(result.current.item?._source).toBe("cache");
    expect(result.current.refreshStatus).toBe("success");
  });

  it("sets refreshStatus to idle on failed refresh", async () => {
    const httpClient = require("@/services/httpClient");
    (httpClient.default.get as jest.Mock).mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useItemDetailData({ barcode: "BAR_1", onBackPress: mockOnBackPress, onMrpChange: mockOnMrpChange, onQuantityChange: mockOnQuantityChange })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleRefreshStock();
    });

    expect(toastService.show).toHaveBeenCalledWith("Failed to refresh stock", { type: "error" });
    expect(result.current.refreshStatus).toBe("idle");
    expect(result.current.lastErpRefresh).toBeNull();
  });

  it("does not update state if response is stale", async () => {
    let resolveRefresh: any;
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    const httpClient = require("@/services/httpClient");
    (httpClient.default.get as jest.Mock).mockReturnValue(refreshPromise);

    const { result } = renderHook(() =>
      useItemDetailData({ barcode: "BAR_1", onBackPress: mockOnBackPress, onMrpChange: mockOnMrpChange, onQuantityChange: mockOnQuantityChange })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    let promise1: any, promise2: any;
    act(() => {
      promise1 = result.current.handleRefreshStock();
      promise2 = result.current.handleRefreshStock();
    });

    await act(async () => {
      resolveRefresh({
        data: {
          success: true,
          data: {
            item_code: "ITEM_1",
            barcode: "BAR_1",
            stock_qty: 50,
            current_stock: 50,
            sql_available: true,
            quantity_source: "sql_verification",
            last_sql_verified_at: "2026-07-24T11:47:00+05:30",
            uom_name: "PCS",
          },
        },
      });
      await promise1;
      await promise2;
    });

    // Only the second (most recent) request should update state
    expect(result.current.item?.stock_qty).toBe(50);
    expect(result.current.lastErpRefresh).toEqual({
      checkedAt: "2026-07-24T11:47:00+05:30",
      source: "sql_server",
      scope: "batch",
    });
  });
});
