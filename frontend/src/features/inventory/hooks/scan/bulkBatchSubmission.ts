import { CreateCountLinePayload, Item } from "@/types/scan";

/**
 * Structural shape of a manually added batch row. Kept local so this module does
 * not depend on the component that renders the batch section.
 */
export interface BulkNewBatchInput {
  barcode: string;
  mrp: string | number;
  quantity: string;
  clientId?: string;
}

export type BulkCountLineOrigin =
  | { kind: "existing"; barcode: string }
  | { kind: "new"; identity: string };

export interface BulkCountLineJob {
  /**
   * Identifies which piece of screen state produced this line, so a partial
   * failure can clear only the entries that actually landed.
   */
  origin: BulkCountLineOrigin;
  payload: CreateCountLinePayload;
}

export const resolveNewBatchIdentity = (batch: BulkNewBatchInput): string =>
  batch.clientId || `barcode:${batch.barcode}`;

const isPositiveQuantity = (value: number): boolean => Number.isFinite(value) && value > 0;

export interface BuildBulkCountLineJobsParams {
  sessionId: string;
  item: Item | null;
  condition: string;
  currentFloor?: string | null;
  currentRack?: string | null;
  /** Counted quantities for batches that already exist in ERP, keyed by barcode. */
  batchCounts: Record<string, string>;
  /** Batches the counter added by hand during this visit. */
  newBatches: BulkNewBatchInput[];
}

/**
 * Builds one count-line payload per batch entry that carries a positive quantity.
 *
 * Each payload gets a deterministic `idempotency_key` derived from the submission
 * content, so retrying after a partial failure replays the same keys and the
 * backend returns the already-created lines instead of counting them twice.
 */
export const buildBulkCountLineJobs = ({
  sessionId,
  item,
  condition,
  currentFloor,
  currentRack,
  batchCounts,
  newBatches,
}: BuildBulkCountLineJobsParams): BulkCountLineJob[] => {
  if (!item) return [];

  const itemCode = item.item_code || "";
  const itemName = item.item_name || item.name || "";
  const floorNo = currentFloor || "Unknown";
  const rackNo = currentRack || "Unknown";
  const jobs: BulkCountLineJob[] = [];

  for (const [batchBarcode, qty] of Object.entries(batchCounts)) {
    const countedQty = parseFloat(qty);
    if (!isPositiveQuantity(countedQty)) continue;

    jobs.push({
      origin: { kind: "existing", barcode: batchBarcode },
      payload: {
        session_id: sessionId,
        item_code: itemCode,
        item_name: itemName,
        counted_qty: countedQty,
        item_condition: condition,
        floor_no: floorNo,
        rack_no: rackNo,
        remark: "bulk-batch-entry",
        barcode: batchBarcode,
        idempotency_key: `bulk:${sessionId}:${itemCode}:${batchBarcode}:${countedQty}`,
      },
    });
  }

  for (const newBatch of newBatches) {
    const countedQty = parseFloat(newBatch.quantity);
    if (!isPositiveQuantity(countedQty)) continue;

    const identity = resolveNewBatchIdentity(newBatch);
    const parsedMrp = parseFloat(String(newBatch.mrp ?? ""));

    jobs.push({
      origin: { kind: "new", identity },
      payload: {
        session_id: sessionId,
        item_code: itemCode,
        item_name: itemName,
        counted_qty: countedQty,
        item_condition: condition,
        floor_no: floorNo,
        rack_no: rackNo,
        remark: "bulk-new-batch-entry",
        mrp_counted: Number.isFinite(parsedMrp) ? parsedMrp : 0,
        barcode: newBatch.barcode,
        idempotency_key: `bulk-new:${sessionId}:${itemCode}:${identity}:${countedQty}`,
      },
    });
  }

  return jobs;
};
