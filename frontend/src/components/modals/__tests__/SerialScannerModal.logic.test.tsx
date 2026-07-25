import { describeInvalidCandidateMessage } from "../SerialScannerModal";
import { classifyBarcode } from "@/utils/barcodeClassifier";

jest.mock("@/services/device/visionCamera", () => ({
  Camera: "Camera",
  useCameraPermission: () => ({
    hasPermission: true,
    requestPermission: jest.fn(),
  }),
  useCameraDevice: () => null,
  useCodeScanner: () => ({}),
}));

describe("SerialScannerModal candidate messaging & classifier burst logic", () => {
  it("prefers duplicate guidance over generic EAN/UPC guidance", () => {
    expect(
      describeInvalidCandidateMessage(
        "123456789012",
        "This serial number has already been added",
      )
    ).toBe("This serial number has already been added");
  });

  it("classifies product barcode followed by valid serial in a mixed burst", () => {
    const burstCodes = [
      "8901234567890", // EAN-13 Product Barcode
      "12345678901234567890", // Long Manufacturer Code
      "HM43G2B8T5G23A0104", // Valid Serial
    ];

    const classifications = burstCodes.map((code) =>
      classifyBarcode(code, { itemBarcode: "8901234567890" })
    );

    expect(classifications[0]!.kind).toBe("product");
    expect(classifications[1]!.kind).toBe("manufacturer");
    expect(classifications[2]!.kind).toBe("serial");
  });

  it("handles duplicate serials and rapid valid serial succession", () => {
    const validSerial1 = "SN-SER-1001";
    const validSerial2 = "SN-SER-1002";

    const c1 = classifyBarcode(validSerial1);
    const c2 = classifyBarcode(validSerial1); // duplicate attempt
    const c3 = classifyBarcode(validSerial2);

    expect(c1.kind).toBe("serial");
    expect(c2.kind).toBe("serial");
    expect(c3.kind).toBe("serial");
  });
});
