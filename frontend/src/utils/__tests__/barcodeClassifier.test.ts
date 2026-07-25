import { classifyBarcode } from "../barcodeClassifier";

describe("classifyBarcode", () => {
  test("identifies direct item barcode and item code matches as product", () => {
    const res = classifyBarcode("8901234567890", { itemBarcode: "8901234567890" });
    expect(res.kind).toBe("product");
    expect(res.confidence).toBe(1.0);
  });

  test("identifies EAN-13, EAN-8, UPC-A, GTIN-14 numeric barcodes as product", () => {
    expect(classifyBarcode("12345678").kind).toBe("product"); // EAN-8
    expect(classifyBarcode("123456789012").kind).toBe("product"); // UPC-A
    expect(classifyBarcode("8901234567890").kind).toBe("product"); // EAN-13
    expect(classifyBarcode("12345678901234").kind).toBe("product"); // GTIN-14
  });

  test("identifies internal stock barcodes starting with 51/52/53 as stock", () => {
    expect(classifyBarcode("510001").kind).toBe("stock");
    expect(classifyBarcode("529999").kind).toBe("stock");
    expect(classifyBarcode("538888").kind).toBe("stock");
  });

  test("identifies long numeric manufacturer labels as manufacturer", () => {
    expect(classifyBarcode("12345678901234567890").kind).toBe("manufacturer");
  });

  test("classifies alphanumeric serials as serial", () => {
    const res = classifyBarcode("HM43G2B8T5G23A0104");
    expect(res.kind).toBe("serial");
    expect(res.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test("returns unknown for empty or short invalid inputs", () => {
    expect(classifyBarcode("").kind).toBe("unknown");
    expect(classifyBarcode("AB").kind).toBe("unknown");
  });
});
