import { describeInvalidCandidateMessage } from "../SerialScannerModal";

jest.mock("expo-camera", () => ({
  CameraView: "CameraView",
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
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
