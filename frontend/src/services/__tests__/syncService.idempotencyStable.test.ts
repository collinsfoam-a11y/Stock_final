import { resolveClientRecordId } from "../syncService";

describe("syncService idempotency stability", () => {
  it("prefers the persisted idempotency_key across retries", () => {
    const item = {
      id: "queue-id-1",
      idempotency_key: "client-record-1",
      data: {
        idempotency_key: "client-record-1",
        _id: "legacy-1",
        id: "legacy-1",
      },
    };

    const resolved = resolveClientRecordId(item as any);
    expect(resolved).toBe("client-record-1");
  });

  it("falls back through legacy ids when idempotency_key is absent", () => {
    const item = {
      id: "queue-id-2",
      data: {
        _id: "legacy-2",
        id: "legacy-2",
      },
    };

    const resolved = resolveClientRecordId(item as any);
    expect(resolved).toBe("legacy-2");
  });
});
