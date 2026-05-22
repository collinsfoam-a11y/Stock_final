import { getItemByBarcode } from "../inventoryWorkflowApi";
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
    jest.spyOn(sessionManagementApi, "shouldAttemptReadApi").mockReturnValue(true);
    jest.spyOn(offlineStorage, "cacheItem").mockResolvedValue(undefined as any);
    (retryWithBackoff as jest.Mock).mockImplementation(async (operation: () => Promise<any>) => {
      return await operation();
    });
    (httpClient.get as jest.Mock).mockResolvedValue({
      data: {
        item: {
          item_code: "ITEM001",
          item_name: "Soap Bar",
          barcode: "510001",
          stock_qty: 12,
          sales_price: 45,
          mrp: 50,
          uom_name: "PCS",
        },
        metadata: { source: "sql_server_sync" },
      },
    });

    const result = await getItemByBarcode("510001");

    expect(result).toEqual(
      expect.objectContaining({
        item_code: "ITEM001",
        item_name: "Soap Bar",
        current_stock: 12,
        sales_price: 45,
        _source: "sql",
      })
    );
    expect(offlineStorage.cacheItem).toHaveBeenCalledWith(
      expect.objectContaining({
        item_code: "ITEM001",
        item_name: "Soap Bar",
        current_stock: 12,
      })
    );
  });

  it("falls back to cached items when the API call fails", async () => {
    jest.spyOn(sessionManagementApi, "shouldAttemptReadApi").mockReturnValue(true);
    jest.spyOn(offlineStorage, "searchItemsInCache").mockResolvedValue([
      {
        item_code: "ITEM001",
        item_name: "Soap Bar",
        barcode: "510002",
        current_stock: 9,
        cached_at: "2026-04-22T00:00:00.000Z",
      },
    ] as any);
    (retryWithBackoff as jest.Mock).mockRejectedValue(new Error("network down"));

    const result = await getItemByBarcode("510002");

    expect(result).toEqual(
      expect.objectContaining({
        item_code: "ITEM001",
        item_name: "Soap Bar",
        _source: "cache",
        _degraded: true,
      })
    );
  });

  it("does not choose an ambiguous fuzzy cache result for direct lookup fallback", async () => {
    jest.spyOn(sessionManagementApi, "shouldAttemptReadApi").mockReturnValue(true);
    jest.spyOn(offlineStorage, "searchItemsInCache").mockResolvedValue([
      {
        item_code: "SAMPLE001",
        item_name: "Sample Item A",
        barcode: "510004",
      },
      {
        item_code: "SAMPLE002",
        item_name: "Sample Item B",
        barcode: "510005",
      },
    ] as any);
    (retryWithBackoff as jest.Mock).mockRejectedValue(new Error("network down"));

    await expect(getItemByBarcode("SAM")).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
  });

  it("uses optimized search for item-code lookups instead of the strict barcode endpoint", async () => {
    jest.spyOn(sessionManagementApi, "shouldAttemptReadApi").mockReturnValue(true);
    jest.spyOn(offlineStorage, "cacheItem").mockResolvedValue(undefined as any);
    (retryWithBackoff as jest.Mock).mockImplementation(async (operation: () => Promise<any>) => {
      return await operation();
    });
    (httpClient.get as jest.Mock).mockResolvedValue({
      data: {
        data: {
          items: [
            {
              id: "search-result-1",
              item_code: "SAM",
              item_name: "Sample Item",
              barcode: "510003",
              stock_qty: 4,
              sale_price: 10,
              uom_name: "PCS",
            },
          ],
          total: 1,
          page: 1,
          page_size: 5,
          metadata: { query: "SAM", has_more: false },
        },
      },
    });

    const result = await getItemByBarcode("SAM");

    expect(httpClient.get).toHaveBeenCalledWith("/api/items/search/optimized", {
      params: {
        q: "SAM",
        limit: 5,
        offset: 0,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        item_code: "SAM",
        item_name: "Sample Item",
        barcode: "510003",
        _source: "api",
      })
    );
  });
});
