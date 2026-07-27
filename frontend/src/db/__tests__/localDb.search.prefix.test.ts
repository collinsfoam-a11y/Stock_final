import * as SQLiteTypes from "expo-sqlite";
import { localDb } from "../localDb";

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(),
}));

const mockGetAllAsync = jest.fn(async () => []);
const mockDb = {
  execAsync: jest.fn(async () => undefined),
  getAllAsync: mockGetAllAsync,
} as unknown as SQLiteTypes.SQLiteDatabase;
const mockOpenDatabaseAsync = SQLiteTypes.openDatabaseAsync as jest.MockedFunction<
  typeof SQLiteTypes.openDatabaseAsync
>;

describe("localDb prefix search", () => {
  beforeEach(() => {
    mockGetAllAsync.mockClear();
    mockOpenDatabaseAsync.mockResolvedValue(mockDb);
  });

  it("anchors barcode search to a prefix query", async () => {
    await localDb.searchItems("5100");
    const calls = mockGetAllAsync.mock.calls as unknown[][];
    const searchCall = calls.find(([sql]) => String(sql).includes("FROM items"));
    expect(searchCall).toBeDefined();
    const call = searchCall![0] as string;
    const args = searchCall![1] as string[];
    expect(call).toContain("barcode LIKE ?");
    expect(args[0]).toBe("5100%");
  });

  it("keeps name/category as contains queries", async () => {
    await localDb.searchItems("widget");
    const calls = mockGetAllAsync.mock.calls as unknown[][];
    const searchCall = calls.find(([sql]) => String(sql).includes("FROM items"));
    expect(searchCall).toBeDefined();
    const call = searchCall![0] as string;
    const args = searchCall![1] as string[];
    expect(call).toContain("name LIKE ?");
    expect(call).toContain("category LIKE ?");
    expect(args[1]).toBe("%widget%");
    expect(args[2]).toBe("%widget%");
  });
});
