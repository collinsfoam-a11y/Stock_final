import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { AppState, Linking } from "react-native";
import { haptics } from "@/services/haptics";

import { PhotoCaptureModal } from "../PhotoCaptureModal";

const mockRequestPermission = jest.fn();
const mockUseCameraPermissions = jest.fn();
const mockGetPermission = jest.fn();
const mockAppStateAddEventListener = jest.fn();

jest.mock("expo-camera", () => ({
  CameraView: "CameraView",
  useCameraPermissions: () => mockUseCameraPermissions(),
}));

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn().mockResolvedValue(undefined),
  },
}));

describe("PhotoCaptureModal permission handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppStateAddEventListener.mockReturnValue({ remove: jest.fn() });
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation(mockAppStateAddEventListener);
  });

  it("triggers haptics and has correct accessibility attributes for grant permission button", async () => {
    mockUseCameraPermissions.mockReturnValue([
      { granted: false, canAskAgain: true },
      mockRequestPermission,
      mockGetPermission,
    ]);

    const { getByText } = render(
      <PhotoCaptureModal
        visible
        onClose={jest.fn()}
        onCapture={jest.fn()}
      />,
    );

    const grantBtn = getByText("Grant Permission");
    expect(grantBtn).toBeTruthy();

    await act(async () => {
      fireEvent.press(grantBtn);
    });

    expect(haptics.light).toHaveBeenCalled();
  });

  it("auto-requests permission and allows a manual retry when camera access can still be asked", async () => {
    mockUseCameraPermissions.mockReturnValue([
      { granted: false, canAskAgain: true },
      mockRequestPermission,
      mockGetPermission,
    ]);

    const { getByText } = render(
      <PhotoCaptureModal
        visible
        onClose={jest.fn()}
        onCapture={jest.fn()}
      />,
    );

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.press(getByText("Grant Permission"));
    });

    expect(mockRequestPermission).toHaveBeenCalledTimes(2);
  });

  it("offers open settings when permission is permanently denied", async () => {
    const openSettingsSpy = jest
      .spyOn(Linking, "openSettings")
      .mockResolvedValue();

    mockUseCameraPermissions.mockReturnValue([
      { granted: false, canAskAgain: false },
      mockRequestPermission,
      mockGetPermission,
    ]);

    const { getByText } = render(
      <PhotoCaptureModal
        visible
        onClose={jest.fn()}
        onCapture={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(getByText("Open Settings"));
    });

    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it("refreshes permission state when the app becomes active again", async () => {
    let onAppStateChange: ((status: string) => void) | null = null;
    mockAppStateAddEventListener.mockImplementation((_event, listener) => {
      onAppStateChange = listener as (status: string) => void;
      return { remove: jest.fn() };
    });
    mockGetPermission.mockResolvedValue({
      granted: true,
      canAskAgain: false,
    });

    mockUseCameraPermissions.mockReturnValue([
      { granted: false, canAskAgain: false },
      mockRequestPermission,
      mockGetPermission,
    ]);

    const { getByText, getByTestId, queryByText } = render(
      <PhotoCaptureModal
        visible
        onClose={jest.fn()}
        onCapture={jest.fn()}
        testID="photo-capture"
      />,
    );

    fireEvent.press(getByText("Open Settings"));

    await act(async () => {
      onAppStateChange?.("active");
    });

    await waitFor(() => {
      expect(queryByText("Open Settings")).toBeNull();
      expect(getByTestId("photo-capture-capture")).toBeTruthy();
    });
  });

  it("verifies close button accessibility and haptic feedback when modal is open", async () => {
    mockUseCameraPermissions.mockReturnValue([
      { granted: true, canAskAgain: true },
      mockRequestPermission,
      mockGetPermission,
    ]);

    const onCloseMock = jest.fn();
    const { getByLabelText } = render(
      <PhotoCaptureModal
        visible
        onClose={onCloseMock}
        onCapture={jest.fn()}
      />,
    );

    const closeBtn = getByLabelText("Close");
    expect(closeBtn).toBeTruthy();

    await act(async () => {
      fireEvent.press(closeBtn);
    });

    expect(haptics.light).toHaveBeenCalled();
    expect(onCloseMock).toHaveBeenCalled();
  });
});
