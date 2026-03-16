import {
  addToOfflineQueue,
  clearOfflineQueue,
  getOfflineQueue,
} from "../offlineStorage";

jest.mock(
  "@react-native-async-storage/async-storage",
  () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@react-native-async-storage/async-storage/jest/async-storage-mock")
      .default,
);

jest.mock("../../../store/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({
      settings: {
        maxQueueSize: 10,
        cacheExpiration: 1,
      },
    }),
  },
}));

describe("offlineStorage queue dedupe", () => {
  beforeEach(async () => {
    await clearOfflineQueue();
  });

  it("deduplicates queue entries by idempotency key", async () => {
    await addToOfflineQueue("count_line", {
      _id: "offline-count-1",
      idempotency_key: "offline-count-1",
      session_id: "sess-1",
      item_code: "ITEM001",
      counted_qty: 1,
    });
    await addToOfflineQueue("count_line", {
      _id: "offline-count-1",
      idempotency_key: "offline-count-1",
      session_id: "sess-1",
      item_code: "ITEM001",
      counted_qty: 2,
    });

    const queue = await getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.data.counted_qty).toBe(2);
    expect(queue[0]?.idempotency_key).toBe("offline-count-1");
  });
});
