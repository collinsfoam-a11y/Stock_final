import {
  addToOfflineQueue,
  acquireOfflineQueueLeases,
  clearOfflineQueue,
  getOfflineQueue,
  releaseOfflineQueueLeases,
  removeManyFromOfflineQueue,
  renewOfflineQueueLeases,
  updateOfflineQueueItem,
} from "../offlineStorage";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
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

  it("acquires, renews, and releases queue leases without replacing the queue", async () => {
    const item = await addToOfflineQueue("count_line", {
      _id: "offline-count-lease",
      idempotency_key: "offline-count-lease",
      session_id: "sess-1",
      item_code: "ITEM001",
      counted_qty: 1,
    });
    const lease = { owner: "sync-owner-a", token: "lease-token-a" };

    const leased = await acquireOfflineQueueLeases([item.id], lease, 60_000);
    expect(leased).toHaveLength(1);
    expect(leased[0]?.lease_owner).toBe("sync-owner-a");
    expect(leased[0]?.lease_token).toBe("lease-token-a");

    const blocked = await acquireOfflineQueueLeases(
      [item.id],
      { owner: "sync-owner-b", token: "lease-token-b" },
      60_000
    );
    expect(blocked).toHaveLength(0);

    await renewOfflineQueueLeases([item.id], lease, 120_000);
    const renewedQueue = await getOfflineQueue();
    expect(renewedQueue[0]?.lease_owner).toBe("sync-owner-a");

    await releaseOfflineQueueLeases([item.id], lease);
    const releasedQueue = await getOfflineQueue();
    expect(releasedQueue[0]?.lease_owner).toBeNull();
    expect(releasedQueue[0]?.lease_token).toBeNull();
  });

  it("blocks stale lease owners from removing or updating queue items", async () => {
    const item = await addToOfflineQueue("count_line", {
      _id: "offline-count-fenced",
      idempotency_key: "offline-count-fenced",
      session_id: "sess-1",
      item_code: "ITEM001",
      counted_qty: 1,
    });
    const activeLease = { owner: "sync-owner-a", token: "lease-token-a" };
    const staleLease = { owner: "sync-owner-b", token: "lease-token-b" };

    await acquireOfflineQueueLeases([item.id], activeLease, 60_000);
    await updateOfflineQueueItem(item.id, { status: "failed_manual_review" }, staleLease);
    await removeManyFromOfflineQueue([item.id], staleLease);

    const queue = await getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.status).toBe("pending");

    await removeManyFromOfflineQueue([item.id], activeLease);
    expect(await getOfflineQueue()).toHaveLength(0);
  });
});
