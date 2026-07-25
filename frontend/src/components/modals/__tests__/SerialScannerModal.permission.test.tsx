import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

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
    jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
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

  it("opens system settings when camera permission cannot be requested again", () => {
    mockUseCameraPermission.mockReturnValue({
      hasPermission: false,
      canAskAgain: false,
      requestPermission: mockRequestPermission,
    });

    const { getByText, queryByText } = render(
      <SerialScannerModal
        visible
        existingSerials={[]}
        onSerialScanned={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    fireEvent.press(getByText("Open Settings"));

    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(queryByText("Grant Permission")).toBeNull();
  });

  it("uses manual entry when the browser cannot request camera access", () => {
    mockUseCameraPermission.mockReturnValue({
      hasPermission: false,
      canAskAgain: false,
      unavailableReason: "Camera needs HTTPS in a mobile browser.",
      requestPermission: mockRequestPermission,
    });

    const { getByText, queryByText } = render(
      <SerialScannerModal
        visible
        existingSerials={[]}
        onSerialScanned={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    fireEvent.press(getByText("Use Manual Entry"));

    expect(getByText("Manual / Bulk Input")).toBeTruthy();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(queryByText("Grant Permission")).toBeNull();
    expect(queryByText("Open Settings")).toBeNull();
  });
});
