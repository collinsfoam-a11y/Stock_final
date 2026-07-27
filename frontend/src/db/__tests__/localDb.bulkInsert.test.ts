import * as SQLiteTypes from "expo-sqlite";
import { saveLocalItems } from "../localDb";

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(),
}));

const mockDb = {
  execAsync: jest.fn(async () => undefined),
  getAllAsync: jest.fn(async () => []),
  withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
  runAsync: jest.fn(async () => undefined),
} as unknown as SQLiteTypes.SQLiteDatabase;

const mockOpenDatabaseAsync = SQLiteTypes.openDatabaseAsync as jest.MockedFunction<
  typeof SQLiteTypes.openDatabaseAsync
>;

describe("localDb bulk insert", () => {
  it("wraps the whole batch in a single transaction", async () => {
    mockOpenDatabaseAsync.mockResolvedValue(mockDb);
    const items = [
      { barcode: "510001", name: "Item 1", category: "Cat1", verified: 1, last_sync: "2026-01-01T00:00:00Z" },
      { barcode: "510002", name: "Item 2", category: "Cat1", verified: 0, last_sync: "2026-01-01T00:00:00Z" },
      { barcode: "510003", name: "Item 3", category: "Cat2", verified: 1, last_sync: "2026-01-01T00:00:00Z" },
    ];

    await saveLocalItems(items);

    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
    const itemInsertCalls = (mockDb.runAsync as jest.Mock).mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT OR REPLACE INTO items")
    );
    expect(itemInsertCalls).toHaveLength(items.length);
  });
});
