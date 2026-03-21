import { fireEvent, render } from "@testing-library/react-native";
import { Linking } from "react-native";

import { PhotoCaptureModal } from "../PhotoCaptureModal";

const mockRequestPermission = jest.fn();
const mockUseCameraPermissions = jest.fn();

jest.mock("expo-camera", () => ({
  CameraView: "CameraView",
  useCameraPermissions: () => mockUseCameraPermissions(),
}));

describe("PhotoCaptureModal permission handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("auto-requests permission and allows a manual retry when camera access can still be asked", () => {
    mockUseCameraPermissions.mockReturnValue([
      { granted: false, canAskAgain: true },
      mockRequestPermission,
    ]);

    const { getByText } = render(
      <PhotoCaptureModal
        visible
        onClose={jest.fn()}
        onCapture={jest.fn()}
      />,
    );

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);

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
      <PhotoCaptureModal
        visible
        onClose={jest.fn()}
        onCapture={jest.fn()}
      />,
    );

    fireEvent.press(getByText("Open Settings"));

    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });
});
