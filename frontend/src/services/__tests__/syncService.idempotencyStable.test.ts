import { resolveClientRecordId } from "../syncService";

describe("resolveClientRecordId", () => {
  it("keeps an existing audit idempotency key stable", () => {
    const item = {
      id: "queue-1",
      type: "count_line",
      timestamp: "2026-01-01T00:00:00.000Z",
      retries: 0,
      data: { audit: { idempotency_key: "stable-key" } },
    };

    expect(resolveClientRecordId(item as any)).toBe("stable-key");
    expect(resolveClientRecordId(item as any)).toBe("stable-key");
  });

  it("falls back to the stable queue id", () => {
    const item = {
      id: "queue-2",
      type: "count_line",
      timestamp: "2026-01-01T00:00:00.000Z",
      retries: 0,
      data: {},
    };

    expect(resolveClientRecordId(item as any)).toBe("queue-2");
  });
});
