import { beforeEach, describe, expect, it, jest } from "@jest/globals";

describe("localDb.web", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const loadModule = async () => {
    const backingStore = new Map<string, unknown>();
    const storage = {
      get: jest.fn(async (key: string, options?: { defaultValue?: unknown }) =>
        backingStore.has(key)
          ? backingStore.get(key)
          : (options?.defaultValue ?? null),
      ),
      set: jest.fn(async (key: string, value: unknown) => {
        backingStore.set(key, value);
        return true;
      }),
    };

    jest.doMock("@/services/storage/asyncStorageService", () => ({ storage }));

    const module = await import("../localDb.web");
    return { ...module, storage };
  };

  it("searches cached items by item code and preserves the mapped code", async () => {
    const { saveLocalItems, localDb } = await loadModule();

    await saveLocalItems([
      {
        barcode: "1234567890",
        item_code: "SKU-42",
        name: "Power Matic",
        category: "Tools",
        verified: 0,
        last_sync: "2026-04-27T00:00:00.000Z",
      },
    ]);

    const results = await localDb.searchItems("SKU-42");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      barcode: "1234567890",
      item_code: "SKU-42",
      item_name: "Power Matic",
    });
  });
});
