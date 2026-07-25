import { act, fireEvent, render } from "@testing-library/react-native";
import { AppState, Linking } from "react-native";

import { PhotoCaptureModal } from "../PhotoCaptureModal";

const mockRequestPermission = jest.fn();
const mockUseCameraPermission = jest.fn();
const mockAppStateAddEventListener = jest.fn();

jest.mock("@/services/device/visionCamera", () => ({
  Camera: "Camera",
  useCameraPermission: () => mockUseCameraPermission(),
  useCameraDevice: () => null,
}));

describe("PhotoCaptureModal permission handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestPermission.mockResolvedValue(true);
    mockAppStateAddEventListener.mockReturnValue({ remove: jest.fn() });
    jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation(mockAppStateAddEventListener);
  });

  it("auto-requests permission and allows a manual retry when camera access is not granted", async () => {
    mockUseCameraPermission.mockReturnValue({
      hasPermission: false,
      requestPermission: mockRequestPermission,
    });

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

  it("shows the capture UI once permission is granted", () => {
    mockUseCameraPermission.mockReturnValue({
      hasPermission: true,
      requestPermission: mockRequestPermission,
    });

    const { getByTestId, queryByText } = render(
      <PhotoCaptureModal
        visible
        onClose={jest.fn()}
        onCapture={jest.fn()}
        testID="photo-capture"
      />,
    );

    expect(queryByText("Grant Permission")).toBeNull();
    expect(getByTestId("photo-capture-capture")).toBeTruthy();
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it("opens system settings when photo permission cannot be requested again", () => {
    mockUseCameraPermission.mockReturnValue({
      hasPermission: false,
      canAskAgain: false,
      requestPermission: mockRequestPermission,
    });

    const { getByText, queryByText } = render(
      <PhotoCaptureModal
        visible
        onClose={jest.fn()}
        onCapture={jest.fn()}
      />,
    );

    fireEvent.press(getByText("Open Settings"));

    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(queryByText("Grant Permission")).toBeNull();
  });

  it("does not request permission or open settings when camera requires HTTPS", () => {
    mockUseCameraPermission.mockReturnValue({
      hasPermission: false,
      canAskAgain: false,
      unavailableReason: "Camera needs HTTPS in a mobile browser.",
      requestPermission: mockRequestPermission,
    });

    const { getByText, queryByText } = render(
      <PhotoCaptureModal
        visible
        onClose={jest.fn()}
        onCapture={jest.fn()}
      />,
    );

    expect(getByText("Camera needs HTTPS in a mobile browser.")).toBeTruthy();
    expect(getByText("Use Expo Go/native or open the app through HTTPS to capture evidence photos.")).toBeTruthy();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(queryByText("Grant Permission")).toBeNull();
    expect(queryByText("Open Settings")).toBeNull();
  });
});
