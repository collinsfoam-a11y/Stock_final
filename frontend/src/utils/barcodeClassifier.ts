import { normalizeSerialValue } from "./scanUtils";

export type BarcodeKind =
  | "serial"
  | "product"
  | "manufacturer"
  | "stock"
  | "gs1"
  | "qr_url"
  | "datamatrix"
  | "pdf417"
  | "aztec"
  | "unknown";

export interface BarcodeClassification {
  kind: BarcodeKind;
  confidence: number; // 0.0 to 1.0
  symbology?: string;
  reason?: string;
  parsedGs1Data?: {
    gtin?: string;
    serial?: string;
    batch?: string;
  };
}

export interface BarcodeClassifierContext {
  itemBarcode?: string;
  itemCode?: string;
  knownSerials?: Set<string>;
  codeType?: string; // e.g. "qr", "data-matrix", "pdf417", "aztec", "code-128", "ean-13"
  expectedKind?: BarcodeKind;
}

/**
 * Centralized Barcode Classifier & 2D GS1 Parser
 * Classifies scanned barcode raw values into domain categories:
 * - "gs1": GS1 Digital Link / GS1-128 / GS1 DataMatrix with AI elements (01 GTIN, 21 Serial)
 * - "qr_url": HTTP/HTTPS URLs scanned via 2D QR codes
 * - "datamatrix": DataMatrix 2D industrial codes
 * - "product": EAN-8, EAN-13, UPC-A, GTIN-14, matching item barcode/item code
 * - "stock": internal stock barcodes (6 digits starting with 51/52/53)
 * - "manufacturer": long numeric-only barcode labels (>14 digits)
 * - "serial": alphanumeric serial number patterns
 * - "unknown": empty or unclassified
 */
export function classifyBarcode(
  rawValue: string,
  context?: BarcodeClassifierContext
): BarcodeClassification {
  const normalized = normalizeSerialValue(rawValue);
  if (!normalized) {
    return { kind: "unknown", confidence: 0, reason: "Empty input" };
  }

  // 1. Check for GS1 Digital Link URL or GS1 AI elements: (01)GTIN + (21)Serial
  if (rawValue.includes("id.gs1.org") || rawValue.includes("(01)") || rawValue.includes("(21)")) {
    const serialMatch = rawValue.match(/\(21\)([A-Za-z0-9\-]+)/) || rawValue.match(/\/21\/([A-Za-z0-9\-]+)/);
    const gtinMatch = rawValue.match(/\(01\)(\d{14})/) || rawValue.match(/\/01\/(\d{14})/);

    return {
      kind: "gs1",
      confidence: 0.98,
      symbology: context?.codeType || "gs1-datamatrix",
      reason: "GS1 Element String / GS1 Digital Link parsed",
      parsedGs1Data: {
        gtin: gtinMatch ? gtinMatch[1] : undefined,
        serial: serialMatch ? serialMatch[1] : undefined,
      },
    };
  }

  // 2. Check for URL / Web QR Code
  if (/^https?:\/\//i.test(rawValue)) {
    return {
      kind: "qr_url",
      confidence: 0.95,
      symbology: context?.codeType || "qr",
      reason: "Web URL scanned via QR/2D code",
    };
  }

  // 3. Direct match with item's main product barcode or item code
  const normItemBarcode = context?.itemBarcode ? normalizeSerialValue(context.itemBarcode) : "";
  const normItemCode = context?.itemCode ? normalizeSerialValue(context.itemCode) : "";

  if (
    (normItemBarcode && normalized === normItemBarcode) ||
    (normItemCode && normalized === normItemCode)
  ) {
    return {
      kind: "product",
      confidence: 1.0,
      symbology: context?.codeType || "product-barcode",
      reason: "Matches item product barcode / item code",
    };
  }

  const numericOnly = /^\d+$/.test(normalized);

  // 4. Internal stock barcodes (6 digits starting with 51, 52, 53)
  const isStockBarcode = /^5[123]\d{4}$/.test(normalized);
  if (isStockBarcode) {
    return {
      kind: "stock",
      confidence: 0.95,
      symbology: context?.codeType || "code-128",
      reason: "Matches internal stock barcode pattern",
    };
  }

  // 5. EAN-8, UPC-A (12), EAN-13 (13), GTIN-14 (14) standard numeric product barcodes
  const isStandardEanOrUpc = numericOnly && [8, 12, 13, 14].includes(normalized.length);
  if (isStandardEanOrUpc && context?.expectedKind !== "serial") {
    return {
      kind: "product",
      confidence: 0.95,
      symbology: context?.codeType || "ean-13",
      reason: `Matches EAN/UPC/GTIN numeric format (length ${normalized.length})`,
    };
  }

  // 6. Long numeric-only manufacturer labels (>14 digits)
  if (numericOnly && normalized.length > 14 && context?.expectedKind !== "serial") {
    return {
      kind: "manufacturer",
      confidence: 0.85,
      symbology: context?.codeType || "code-128",
      reason: "Long numeric manufacturer code",
    };
  }

  // 7. Numeric-only strings >= 10 chars are generally product GTINs/UANs
  if (numericOnly && normalized.length >= 10 && context?.expectedKind !== "serial") {
    return {
      kind: "product",
      confidence: 0.85,
      symbology: context?.codeType || "gtin",
      reason: "Numeric product GTIN/UAN format",
    };
  }

  // 8. Valid serial number: alphanumeric, length 3-50
  if (normalized.length >= 3 && normalized.length <= 50 && /^[A-Z0-9\-]+$/.test(normalized)) {
    return {
      kind: "serial",
      confidence: 0.9,
      symbology: context?.codeType || "code-128",
      reason: "Valid serial number pattern",
    };
  }

  return {
    kind: "unknown",
    confidence: 0.3,
    symbology: context?.codeType || "unknown",
    reason: "Unrecognized format",
  };
}
