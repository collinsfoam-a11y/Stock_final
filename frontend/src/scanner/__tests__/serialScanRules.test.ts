import {
  decide,
  isLikelyEanUpc,
  isSerialLike,
  normalizeScanValue,
  scoreCandidate,
} from "../serialScanRules";

describe("serialScanRules.normalizeScanValue", () => {
  it("uppercases and strips whitespace for linear barcodes", () => {
    expect(normalizeScanValue(" qan44 zay ", "code128")).toBe("QAN44ZAY");
  });

  it("preserves case/spacing for QR and DataMatrix payloads", () => {
    expect(normalizeScanValue("Serial: aB c", "QR")).toBe("Serial: aB c");
    expect(normalizeScanValue(" Json{a b} ", "datamatrix")).toBe("Json{a b}");
  });
});

describe("serialScanRules classification", () => {
  it("recognizes EAN/UPC numeric barcodes", () => {
    expect(isLikelyEanUpc("8901234567890")).toBe(true); // EAN-13
    expect(isLikelyEanUpc("12345678")).toBe(true); // EAN-8
    expect(isLikelyEanUpc("QAN44ZAY711883")).toBe(false);
  });

  it("recognizes alphanumeric serial-like values", () => {
    expect(isSerialLike("QAN44ZAY711883")).toBe(true);
    expect(isSerialLike("8901234567890")).toBe(false); // digits only
    expect(isSerialLike("SHORT")).toBe(false); // < 8 chars
  });
});

describe("serialScanRules.decide", () => {
  it("SERIAL mode: rejects product EAN/UPC barcodes", () => {
    const result = decide("SERIAL", {
      raw: "8901234567890",
      value: "8901234567890",
      symbology: "ean13",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/EAN\/UPC/);
  });

  it("SERIAL mode: accepts a valid alphanumeric serial", () => {
    const result = decide("SERIAL", {
      raw: "QAN44ZAY711883",
      value: "QAN44ZAY711883",
      symbology: "code128",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("SERIAL");
      expect(result.value).toBe("QAN44ZAY711883");
    }
  });

  it("ITEM mode: rejects a serial-looking value and requires EAN/UPC", () => {
    const result = decide("ITEM", {
      raw: "QAN44ZAY711883",
      value: "QAN44ZAY711883",
      symbology: "code128",
    });
    expect(result.ok).toBe(false);
  });

  it("scoreCandidate hard-blocks EAN in SERIAL mode and favors serials", () => {
    expect(scoreCandidate("SERIAL", "8901234567890", "ean13")).toBeLessThan(0);
    expect(
      scoreCandidate("SERIAL", "QAN44ZAY711883", "code128")
    ).toBeGreaterThan(scoreCandidate("ITEM", "QAN44ZAY711883", "code128"));
  });
});
