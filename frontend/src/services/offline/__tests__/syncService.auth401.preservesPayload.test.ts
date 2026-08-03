import { enqueueMutation, flushOfflineQueue } from "../offlineQueue";

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(),
}));

jest.mock("../../../store/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({
      settings: { maxQueueSize: 10, cacheExpiration: 1 },
    }),
  },
}));

describe("offlineQueue 401 handling", () => {
  it("preserves the queued payload when the API returns 401", async () => {
    const client = {
      request: jest.fn(async () => {
        const error = new Error("Unauthorized") as Error & {
          response?: { status: number };
        };
        error.response = { status: 401 };
        throw error;
      }),
    };

    await enqueueMutation({
      method: "POST",
      url: "/api/count-lines/sync",
      data: { item_code: "ITEM-1", counted_qty: 1 },
    });

    const result = await flushOfflineQueue(client as any);

    expect(result.processed).toBe(0);
    expect(result.remaining).toBe(1);
  });
});
