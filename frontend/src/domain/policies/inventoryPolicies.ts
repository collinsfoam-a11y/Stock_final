import type { CreateCountLinePayload } from "@/types/scan";

export class InventoryPolicyError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "InventoryPolicyError";
    this.code = code;
  }
}

const decimalPlaces = (value: number): number => {
  const normalized = value.toString();
  const index = normalized.indexOf(".");
  return index >= 0 ? normalized.length - index - 1 : 0;
};

const normalizeSerials = (payload: CreateCountLinePayload): string[] => {
  const directSerials = Array.isArray(payload.serial_numbers) ? payload.serial_numbers : [];
  const entrySerials = Array.isArray(payload.serial_entries)
    ? payload.serial_entries
        .map((entry) => entry.serial_number)
        .filter((serial): serial is string => typeof serial === "string")
    : [];

  return [...directSerials, ...entrySerials]
    .map((serial) => serial.trim().toUpperCase())
    .filter(Boolean);
};

export const enforceCountLinePolicies = (
  payload: CreateCountLinePayload,
  context?: {
    uom?: string | null;
    allowFraction?: boolean;
    maxPrecision?: number;
  }
): void => {
  if (!Number.isFinite(payload.counted_qty) || payload.counted_qty < 0) {
    throw new InventoryPolicyError(
      "INVALID_QUANTITY",
      "Counted quantity must be a non-negative finite number."
    );
  }

  const maxPrecision = context?.maxPrecision ?? 3;
  if (decimalPlaces(payload.counted_qty) > maxPrecision) {
    throw new InventoryPolicyError(
      "PRECISION_EXCEEDED",
      `Counted quantity exceeds supported precision (${maxPrecision} decimals).`
    );
  }

  const normalizedUom = context?.uom?.trim().toUpperCase();
  if (normalizedUom === "NOS" && !Number.isInteger(payload.counted_qty)) {
    throw new InventoryPolicyError(
      "FRACTION_NOT_ALLOWED",
      "Fractional quantity is not allowed for NOS items."
    );
  }

  if (context?.allowFraction === false && !Number.isInteger(payload.counted_qty)) {
    throw new InventoryPolicyError(
      "FRACTION_NOT_ALLOWED",
      "Fractional quantity is not allowed for this item."
    );
  }

  const normalizedSerials = normalizeSerials(payload);
  if (normalizedSerials.length === 0) {
    return;
  }

  const uniqueSerials = new Set(normalizedSerials);
  if (uniqueSerials.size !== normalizedSerials.length) {
    throw new InventoryPolicyError(
      "SERIAL_DUPLICATE",
      "Duplicate serial numbers were provided for the same item."
    );
  }

  if (!Number.isInteger(payload.counted_qty)) {
    throw new InventoryPolicyError(
      "FRACTION_NOT_ALLOWED",
      "Serialized item quantity must be an integer."
    );
  }

  if (payload.counted_qty !== normalizedSerials.length) {
    throw new InventoryPolicyError(
      "SERIAL_QTY_MISMATCH",
      "Serialized item quantity must match the number of serials entered."
    );
  }
};
