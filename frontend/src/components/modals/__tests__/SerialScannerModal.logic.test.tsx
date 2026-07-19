import { describeInvalidCandidateMessage } from "../SerialScannerModal";

jest.mock("@/services/device/visionCamera", () => ({
  Camera: "Camera",
  useCameraPermission: () => ({
    hasPermission: true,
    requestPermission: jest.fn(),
  }),
  useCameraDevice: () => null,
  useCodeScanner: () => ({}),
}));

describe("SerialScannerModal invalid candidate messaging", () => {
  it("prefers duplicate guidance over generic EAN/UPC guidance", () => {
    expect(
      describeInvalidCandidateMessage(
        "123456789012",
        "This serial number has already been added",
      ),
    ).toBe("This serial number has already been added");
  });
});
