import { getItemByBarcode, getItemByIdentifier } from "../inventoryWorkflowApi";
import * as sessionManagementApi from "../sessionManagementApi";
import * as offlineStorage from "../../offline/offlineStorage";
import httpClient from "../../httpClient";
import { retryWithBackoff } from "../../../utils/retry";

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

jest.mock("../../../utils/retry", () => ({
  retryWithBackoff: jest.fn(),
}));

describe("getItemByBarcode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("normalizes API item responses and caches the result", async () => {
    jest.spyOn(sessionManagementApi, "isOnline").mockReturnValue(true);
    jest.spyOn(offlineStorage, "cacheItem").mockResolvedValue(undefined as any);
    (retryWithBackoff as jest.Mock).mockImplementation(async (operation: () => Promise<any>) => {
      return await operation();
    });
    (httpClient.get as jest.Mock).mockResolvedValue({
      data: {
        item: {
          item_code: "ITEM001",
          item_name: "Soap Bar",
          barcode: "12345678",
          stock_qty: 12,
          sales_price: 45,
          mrp: 50,
          uom_name: "PCS",
        },
        metadata: { source: "sql_server_sync" },
      },
    });

    const result = await getItemByBarcode("12345678");

    expect(result).toEqual(
      expect.objectContaining({
        item_code: "ITEM001",
        item_name: "Soap Bar",
        current_stock: 12,
        sales_price: 45,
        _source: "sql",
      }),
    );
    expect(offlineStorage.cacheItem).toHaveBeenCalledWith(
      expect.objectContaining({
        item_code: "ITEM001",
        item_name: "Soap Bar",
        current_stock: 12,
      }),
    );
  });

  it("falls back to cached items when the API call fails", async () => {
    jest.spyOn(sessionManagementApi, "isOnline").mockReturnValue(true);
    jest.spyOn(offlineStorage, "searchItemsInCache").mockResolvedValue([
      {
        item_code: "ITEM001",
        item_name: "Soap Bar",
        barcode: "12345678",
        current_stock: 9,
        cached_at: "2026-04-22T00:00:00.000Z",
      },
    ] as any);
    (retryWithBackoff as jest.Mock).mockRejectedValue(new Error("network down"));

    const result = await getItemByBarcode("12345678");

    expect(result).toEqual(
      expect.objectContaining({
        item_code: "ITEM001",
        item_name: "Soap Bar",
        _source: "cache",
        _degraded: true,
      }),
    );
  });

  it("loads item details by item code for typed search result selections", async () => {
    jest.spyOn(sessionManagementApi, "isOnline").mockReturnValue(true);
    jest.spyOn(offlineStorage, "cacheItem").mockResolvedValue(undefined as any);
    (retryWithBackoff as jest.Mock).mockImplementation(async (operation: () => Promise<any>) => {
      return await operation();
    });
    (httpClient.get as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: {
          id: "mongo-id",
          item_code: "5089",
          barcode: "515090",
          name: "SAMAVER MEDIUM",
          stock_qty: 4,
          mrp: 2750,
          uom_name: "PCs",
        },
      },
    });

    const result = await getItemByIdentifier("5089");

    expect(httpClient.get).toHaveBeenCalledWith("/api/v2/items/5089");
    expect(result).toEqual(
      expect.objectContaining({
        item_code: "5089",
        barcode: "515090",
        item_name: "SAMAVER MEDIUM",
        current_stock: 4,
        _source: "api",
      }),
    );
  });
});
