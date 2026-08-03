import {
  isSerialNumberFormat,
  validateScannedSerial,
} from "../scanUtils";

describe("scanUtils serial format", () => {
  it("accepts valid alphanumeric serial values", () => {
    expect(isSerialNumberFormat("SN-AB12-34")).toBe(true);
    expect(validateScannedSerial("SN-AB12-34", []).valid).toBe(true);
  });

  it("rejects product barcode pattern in serial mode", () => {
    expect(isSerialNumberFormat("510001")).toBe(false);
    const result = validateScannedSerial("510001", []);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("barcode");
  });

  it("rejects long numeric-only UAN/barcode-like values", () => {
    expect(isSerialNumberFormat("12345678901234567")).toBe(false);
    const result = validateScannedSerial("12345678901234567", []);
    expect(result.valid).toBe(false);
  });

  it("rejects duplicates already present in current list", () => {
    const result = validateScannedSerial("abc123", ["ABC123"]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("already been added");
  });
});
