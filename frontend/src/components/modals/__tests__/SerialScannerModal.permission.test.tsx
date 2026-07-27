import { fireEvent, render, waitFor } from "@testing-library/react-native";

import SerialScannerModal from "../SerialScannerModal";

const mockRequestPermission = jest.fn();
const mockUseCameraPermissions = jest.fn();

jest.mock("@/services/device/visionCamera", () => ({
  Camera: "Camera",
  useCameraDevice: () => ({ id: "back-camera" }),
  useCodeScanner: () => ({}),
  useCameraPermission: () => {
    const [permission, requestPermission] = mockUseCameraPermissions();
    return { hasPermission: permission?.granted === true, requestPermission };
  },
}));

describe("SerialScannerModal permission handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requests camera permission when access can still be asked", async () => {
    mockUseCameraPermissions.mockReturnValue([
      { granted: false, canAskAgain: true },
      mockRequestPermission,
    ]);

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

  it("keeps permission retry and manual entry available when denied", () => {
    mockUseCameraPermissions.mockReturnValue([
      { granted: false, canAskAgain: false },
      mockRequestPermission,
    ]);

    const { getByText } = render(
      <SerialScannerModal
        visible
        existingSerials={[]}
        onSerialScanned={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(getByText("Grant Permission")).toBeTruthy();
    expect(getByText("Use Manual Entry")).toBeTruthy();
  });
});
