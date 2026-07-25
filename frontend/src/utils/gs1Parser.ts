/**
 * Standalone Modular GS1 Application Identifier (AI) Parser
 * Extracts standard GS1 AIs:
 * - 01: GTIN (14 digits)
 * - 21: Serial Number
 * - 10: Batch/Lot Number
 * - 17: Expiration Date (YYMMDD)
 */

export interface ParsedGS1Data {
  isValidGS1: boolean;
  gtin?: string;
  serial?: string;
  batch?: string;
  expirationDate?: string;
  rawAIString?: string;
}

export function parseGS1Barcode(rawValue: string): ParsedGS1Data {
  if (!rawValue) {
    return { isValidGS1: false };
  }

  // 1. GS1 Digital Link URL format (https://id.gs1.org/01/08901234567890/21/SER12345)
  if (rawValue.includes("gs1.org") || rawValue.includes("/01/")) {
    const gtinMatch = rawValue.match(/\/01\/(\d{14})/);
    const serialMatch = rawValue.match(/\/21\/([A-Za-z0-9\-]+)/);
    const batchMatch = rawValue.match(/\/10\/([A-Za-z0-9\-]+)/);

    return {
      isValidGS1: true,
      gtin: gtinMatch ? gtinMatch[1] : undefined,
      serial: serialMatch ? serialMatch[1] : undefined,
      batch: batchMatch ? batchMatch[1] : undefined,
      rawAIString: rawValue,
    };
  }

  // 2. Element String format with parentheses: (01)08901234567890(21)SN100293
  if (rawValue.includes("(01)") || rawValue.includes("(21)")) {
    const gtinMatch = rawValue.match(/\(01\)(\d{14})/);
    const serialMatch = rawValue.match(/\(21\)([A-Za-z0-9\-]+)/);
    const batchMatch = rawValue.match(/\(10\)([A-Za-z0-9\-]+)/);
    const expMatch = rawValue.match(/\(17\)(\d{6})/);

    return {
      isValidGS1: true,
      gtin: gtinMatch ? gtinMatch[1] : undefined,
      serial: serialMatch ? serialMatch[1] : undefined,
      batch: batchMatch ? batchMatch[1] : undefined,
      expirationDate: expMatch ? expMatch[1] : undefined,
      rawAIString: rawValue,
    };
  }

  return { isValidGS1: false };
}
