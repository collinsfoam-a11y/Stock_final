import { fireEvent, render, waitFor } from "@testing-library/react-native";

import SerialScannerModal from "../SerialScannerModal";

const mockRequestPermission = jest.fn();
const mockUseCameraPermission = jest.fn();

jest.mock("@/services/device/visionCamera", () => ({
  Camera: "Camera",
  useCameraPermission: () => mockUseCameraPermission(),
  useCameraDevice: () => null,
  useCodeScanner: () => ({}),
}));

describe("SerialScannerModal permission handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Resolve true so the modal's auto-request doesn't flip its
    // denied-after-request state, which would swap the Grant Permission
    // button for Open Settings.
    mockRequestPermission.mockResolvedValue(true);
  });

  it("requests camera permission when access is not yet granted", async () => {
    mockUseCameraPermission.mockReturnValue({
      hasPermission: false,
      requestPermission: mockRequestPermission,
    });

    const { getByText } = render(
      <SerialScannerModal
        visible
        existingSerials={[]}
        onSerialScanned={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(getByText("Grant Permission"));

    expect(mockRequestPermission).toHaveBeenCalledTimes(2);
  });
});
