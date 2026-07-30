import {
  buildBulkCountLineJobs,
  resolveNewBatchIdentity,
} from "../bulkBatchSubmission";
import { Item } from "@/types/scan";

const item = {
  item_code: "SKU-1",
  item_name: "Widget",
} as Item;

const baseParams = {
  sessionId: "session-1",
  item,
  condition: "Good",
  currentFloor: "F1",
  currentRack: "R1",
  batchCounts: {},
  newBatches: [],
};

describe("buildBulkCountLineJobs", () => {
  it("skips entries without a positive quantity", () => {
    const jobs = buildBulkCountLineJobs({
      ...baseParams,
      batchCounts: { "bar-1": "0", "bar-2": "", "bar-3": "abc", "bar-4": "-2", "bar-5": "3" },
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.payload.barcode).toBe("bar-5");
    expect(jobs[0]?.payload.counted_qty).toBe(3);
  });

  it("returns no jobs when the item has not resolved", () => {
    expect(
      buildBulkCountLineJobs({ ...baseParams, item: null, batchCounts: { "bar-1": "2" } })
    ).toEqual([]);
  });

  it("carries batch identity and location onto every payload", () => {
    const jobs = buildBulkCountLineJobs({
      ...baseParams,
      batchCounts: { "bar-1": "2" },
      newBatches: [{ barcode: "bar-new", mrp: "45.5", quantity: "1", clientId: "cid-1" }],
    });

    expect(jobs.map((job) => job.payload)).toEqual([
      expect.objectContaining({
        session_id: "session-1",
        item_code: "SKU-1",
        item_name: "Widget",
        barcode: "bar-1",
        counted_qty: 2,
        floor_no: "F1",
        rack_no: "R1",
        remark: "bulk-batch-entry",
      }),
      expect.objectContaining({
        barcode: "bar-new",
        counted_qty: 1,
        mrp_counted: 45.5,
        remark: "bulk-new-batch-entry",
      }),
    ]);
  });

  it("falls back to Unknown when floor and rack are missing", () => {
    const jobs = buildBulkCountLineJobs({
      ...baseParams,
      currentFloor: null,
      currentRack: undefined,
      batchCounts: { "bar-1": "2" },
    });

    expect(jobs[0]?.payload.floor_no).toBe("Unknown");
    expect(jobs[0]?.payload.rack_no).toBe("Unknown");
  });

  it("coerces an unparseable MRP to zero rather than NaN", () => {
    const jobs = buildBulkCountLineJobs({
      ...baseParams,
      newBatches: [{ barcode: "bar-new", mrp: "", quantity: "1", clientId: "cid-1" }],
    });

    expect(jobs[0]?.payload.mrp_counted).toBe(0);
  });

  it("produces the same idempotency keys for an unchanged retry", () => {
    const params = {
      ...baseParams,
      batchCounts: { "bar-1": "2", "bar-2": "5" },
      newBatches: [{ barcode: "bar-new", mrp: 10, quantity: "1", clientId: "cid-1" }],
    };

    const first = buildBulkCountLineJobs(params).map((job) => job.payload.idempotency_key);
    const second = buildBulkCountLineJobs(params).map((job) => job.payload.idempotency_key);

    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(3);
    expect(first.every((key) => typeof key === "string" && key.length > 0)).toBe(true);
  });

  it("gives distinct keys to same-quantity batches so neither is deduplicated away", () => {
    const jobs = buildBulkCountLineJobs({
      ...baseParams,
      batchCounts: { "bar-1": "1", "bar-2": "1" },
    });

    expect(jobs[0]?.payload.idempotency_key).not.toBe(jobs[1]?.payload.idempotency_key);
  });

  it("distinguishes hand-added batches that share a barcode via clientId", () => {
    const jobs = buildBulkCountLineJobs({
      ...baseParams,
      newBatches: [
        { barcode: "same-bar", mrp: 10, quantity: "1", clientId: "cid-1" },
        { barcode: "same-bar", mrp: 20, quantity: "1", clientId: "cid-2" },
      ],
    });

    expect(jobs).toHaveLength(2);
    expect(jobs[0]?.payload.idempotency_key).not.toBe(jobs[1]?.payload.idempotency_key);
  });

  it("changes the key when the counted quantity is edited", () => {
    const before = buildBulkCountLineJobs({ ...baseParams, batchCounts: { "bar-1": "2" } });
    const after = buildBulkCountLineJobs({ ...baseParams, batchCounts: { "bar-1": "3" } });

    expect(before[0]?.payload.idempotency_key).not.toBe(after[0]?.payload.idempotency_key);
  });

  it("tags each job with the screen state that produced it", () => {
    const jobs = buildBulkCountLineJobs({
      ...baseParams,
      batchCounts: { "bar-1": "2" },
      newBatches: [{ barcode: "bar-new", mrp: 10, quantity: "1", clientId: "cid-1" }],
    });

    expect(jobs[0]?.origin).toEqual({ kind: "existing", barcode: "bar-1" });
    expect(jobs[1]?.origin).toEqual({ kind: "new", identity: "cid-1" });
  });
});

describe("resolveNewBatchIdentity", () => {
  it("prefers the client id", () => {
    expect(
      resolveNewBatchIdentity({ barcode: "bar", mrp: 1, quantity: "1", clientId: "cid-9" })
    ).toBe("cid-9");
  });

  it("falls back to the barcode when no client id was stamped", () => {
    expect(resolveNewBatchIdentity({ barcode: "bar", mrp: 1, quantity: "1" })).toBe("barcode:bar");
  });
});
