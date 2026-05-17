import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

import SerialScannerModal from "../SerialScannerModal";

const mockRequestPermission = jest.fn();
const mockUseCameraPermissions = jest.fn();

jest.mock("expo-camera", () => ({
  CameraView: "CameraView",
  useCameraPermissions: () => mockUseCameraPermissions(),
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

  it("offers open settings when permission is permanently denied", () => {
    const openSettingsSpy = jest
      .spyOn(Linking, "openSettings")
      .mockResolvedValue();

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

    fireEvent.press(getByText("Open Settings"));

    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });
});
