import {
  dedupeItemsKeepingHighestStock,
  getStockQty,
  sortItemsByStockDesc,
} from "../itemBatchUtils";

describe("itemBatchUtils", () => {
  it("returns stock from stock_qty or current_stock", () => {
    expect(getStockQty({ stock_qty: 12 })).toBe(12);
    expect(getStockQty({ current_stock: 7 })).toBe(7);
    expect(getStockQty({})).toBe(0);
  });

  it("sorts items by stock in descending order", () => {
    const sorted = sortItemsByStockDesc([
      { item_code: "A", stock_qty: 3 },
      { item_code: "B", stock_qty: 10 },
      { item_code: "C", current_stock: 6 },
    ]);

    expect(sorted.map((x) => x.item_code)).toEqual(["B", "C", "A"]);
  });

  it("keeps higher-stock item when same item appears in search results", () => {
    const deduped = dedupeItemsKeepingHighestStock([
      { item_code: "1001", barcode: "510001", stock_qty: 2, item_name: "Oil" },
      {
        item_code: "1001",
        barcode: "510001A",
        stock_qty: 11,
        item_name: "Oil",
      },
      { item_code: "2001", barcode: "520001", stock_qty: 5, item_name: "Rice" },
    ]);

    expect(deduped).toHaveLength(2);
    expect(deduped[0]).toBeDefined();
    expect(deduped[0]?.item_code).toBe("1001");
    expect(deduped[0]?.stock_qty).toBe(11);
  });
});
