import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  enqueueMutation,
  flushOfflineQueue,
  getConflicts,
  getQueueCount,
  listQueue,
  resolveConflict,
} from "../offlineQueue";
import { resetMutationJournal } from "../offlineMutationJournal";
import { useNetworkStore } from "../../../store/networkStore";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const makeClient = () => ({
  request: jest.fn(),
});

describe("offline mutation interceptor queue", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await resetMutationJournal();
    await AsyncStorage.clear();
    useNetworkStore.setState({
      isOnline: true,
      isInternetReachable: true,
      connectionType: "wifi",
      isRestrictedMode: false,
    });
  });

  it("persists queued mutations through the append-only journal", async () => {
    const queued = await enqueueMutation({
      method: "post",
      url: "/count-lines",
      data: { item_code: "ITEM001" },
    });

    const queue = await listQueue();

    expect(await getQueueCount()).toBe(1);
    expect(queue[0]).toEqual(expect.objectContaining({ id: queued.id, url: "/count-lines" }));
    expect(queue[0]?.leaseOwner).toBeNull();
  });

  it("flushes successful mutations and removes them only after request success", async () => {
    const client = makeClient();
    client.request.mockResolvedValue({ status: 200 });
    await enqueueMutation({
      method: "patch",
      url: "/items/ITEM001",
      data: { counted_qty: 2 },
    });

    const result = await flushOfflineQueue(client as any);

    expect(result).toEqual({ processed: 1, remaining: 0 });
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "patch",
        url: "/items/ITEM001",
        data: { counted_qty: 2 },
      })
    );
    expect(await listQueue()).toHaveLength(0);
  });

  it("releases the lease and preserves the item when network failure interrupts flush", async () => {
    const client = makeClient();
    client.request.mockRejectedValue(new Error("Network unavailable"));
    await enqueueMutation({
      method: "post",
      url: "/count-lines",
      data: { item_code: "ITEM001" },
    });

    const result = await flushOfflineQueue(client as any);
    const queue = await listQueue();

    expect(result).toEqual({ processed: 0, remaining: 1 });
    expect(queue).toHaveLength(1);
    expect(queue[0]?.leaseOwner).toBeNull();
    expect(queue[0]?.leaseToken).toBeNull();
  });

  it("moves terminal validation failures to conflict journal without leaving active queue work", async () => {
    const client = makeClient();
    client.request.mockRejectedValue({
      response: { status: 409, data: { code: "CONFLICT" } },
    });
    const queued = await enqueueMutation({
      method: "post",
      url: "/count-lines",
      data: { item_code: "ITEM001" },
    });

    const result = await flushOfflineQueue(client as any);
    const conflicts = await getConflicts();

    expect(result).toEqual({ processed: 1, remaining: 0 });
    expect(await listQueue()).toHaveLength(0);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual(expect.objectContaining({ id: queued.id, resolved: false }));

    expect(await resolveConflict(queued.id)).toBe(true);
    expect(await getConflicts()).toHaveLength(0);
  });
});
