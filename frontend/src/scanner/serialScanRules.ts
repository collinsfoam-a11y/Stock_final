// src/scanner/serialScanRules.ts

export type ScanMode = "SERIAL" | "ITEM" | "AUTO";

export type ScanCandidate = {
  raw: string;
  value: string; // normalized
  symbology?: string; // expo "type"
};

export type ScanDecision =
  | { ok: true; kind: "SERIAL" | "ITEM"; value: string; reason: string }
  | { ok: false; reason: string };

export function normalizeScanValue(input: string, symbology?: string): string {
  const t = (symbology ?? "").toLowerCase();
  const val = (input ?? "").trim();

  // For QR/DataMatrix, preserve case and spacing (often contains JSON or URLs)
  if (t.includes("qr") || t.includes("datamatrix")) {
    return val;
  }

  // For linear barcodes (Code128, Code39, etc.), normalize aggressively
  return val.toUpperCase().replace(/\s+/g, "");
}

export function isLikelyEanUpc(v: string): boolean {
  // EAN-13, EAN-8, UPC-A, UPC-E, GTIN-14-ish
  return /^\d{8}$/.test(v) || /^\d{12,14}$/.test(v);
}

export function isSerialLike(v: string): boolean {
  // Letters + digits, minimum length — fits Voltas/Samsung/BlueStar patterns
  if (v.length < 8) return false;
  const hasLetter = /[A-Z]/.test(v);
  const hasDigit = /[0-9]/.test(v);
  return hasLetter && hasDigit;
}

export function isTooShort(v: string): boolean {
  return v.length < 4;
}

export function scoreCandidate(
  mode: ScanMode,
  value: string,
  symbology?: string,
): number {
  if (!value || isTooShort(value)) return -999;

  const t = (symbology ?? "").toLowerCase();

  // Base score: prefer longer stable identifiers (up to a cap)
  let score = Math.min(30, value.length);

  const ean = isLikelyEanUpc(value);
  const serial = isSerialLike(value);

  if (mode === "SERIAL") {
    // Hard block product EAN/UPC in serial mode
    if (ean) return -500;
    if (t.includes("ean") || t.includes("upc")) return -500;

    if (serial) score += 250;
    if (t.includes("code128") || t.includes("code39") || t.includes("code93"))
      score += 60;
    if (t.includes("qr") || t.includes("datamatrix")) score += 40;

    // Penalize purely numeric non-ean (rare, but reduces false positives)
    if (/^\d+$/.test(value)) score -= 80;
  }

  if (mode === "ITEM") {
    // Prefer EAN/UPC in item mode
    if (ean) score += 250;
    if (t.includes("ean") || t.includes("upc")) score += 60;

    // Discourage serial-like in item mode
    if (serial) score -= 60;
  }

  if (mode === "AUTO") {
    if (ean) score += 120;
    if (serial) score += 120;
    if (
      t.includes("code128") ||
      t.includes("code39") ||
      t.includes("qr") ||
      t.includes("datamatrix")
    )
      score += 20;
  }

  return score;
}

export function decide(mode: ScanMode, candidate: ScanCandidate): ScanDecision {
  const value = candidate.value;
  const t = candidate.symbology?.toLowerCase() ?? "";

  if (!value) return { ok: false, reason: "Empty scan." };

  if (mode === "SERIAL") {
    if (isLikelyEanUpc(value) || t.includes("ean") || t.includes("upc")) {
      return {
        ok: false,
        reason:
          "Detected EAN/UPC (product barcode). Scan the SERIAL label (letters+numbers).",
      };
    }
    if (!isSerialLike(value)) {
      return {
        ok: false,
        reason:
          "Invalid serial format. Scan alphanumeric serial (e.g., QAN44ZAY711883).",
      };
    }
    return { ok: true, kind: "SERIAL", value, reason: "Serial accepted." };
  }

  if (mode === "ITEM") {
    if (!isLikelyEanUpc(value)) {
      return {
        ok: false,
        reason:
          "Not an EAN/UPC item barcode. Switch to SERIAL mode if you are scanning unit serial.",
      };
    }
    return { ok: true, kind: "ITEM", value, reason: "Item barcode accepted." };
  }

  // AUTO
  if (isLikelyEanUpc(value))
    return {
      ok: true,
      kind: "ITEM",
      value,
      reason: "Auto-detected item barcode.",
    };
  if (isSerialLike(value))
    return { ok: true, kind: "SERIAL", value, reason: "Auto-detected serial." };

  return {
    ok: false,
    reason: "Unrecognized code. Try scanning a different barcode on the label.",
  };
}
