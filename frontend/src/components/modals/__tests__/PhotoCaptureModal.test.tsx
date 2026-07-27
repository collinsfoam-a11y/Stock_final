import { act, fireEvent, render } from "@testing-library/react-native";
import { AppState } from "react-native";

import { PhotoCaptureModal } from "../PhotoCaptureModal";

const mockRequestPermission = jest.fn();
const mockUseCameraPermissions = jest.fn();
const mockGetPermission = jest.fn();
const mockAppStateAddEventListener = jest.fn();

jest.mock("@/services/device/visionCamera", () => ({
  Camera: "Camera",
  useCameraDevice: () => ({ id: "back-camera" }),
  useCameraPermission: () => {
    const [permission, requestPermission] = mockUseCameraPermissions();
    return { hasPermission: permission?.granted === true, requestPermission };
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

  it("keeps a manual retry available when camera permission is denied", async () => {
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

    expect(getByText("Grant Permission")).toBeTruthy();
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it("refreshes permission state when the app becomes active again", async () => {
    let onAppStateChange: ((status: string) => void) | null = null;
    mockAppStateAddEventListener.mockImplementation((_event, listener) => {
      onAppStateChange = listener as (status: string) => void;
      return { remove: jest.fn() };
    });
    mockUseCameraPermissions.mockReturnValue([
      { granted: false, canAskAgain: false },
      mockRequestPermission,
      mockGetPermission,
    ]);

    const { getByText, getByTestId } = render(
      <PhotoCaptureModal
        visible
        onClose={jest.fn()}
        onCapture={jest.fn()}
        testID="photo-capture"
      />,
    );

    await act(async () => {
      onAppStateChange?.("active");
    });

    expect(getByText("Grant Permission")).toBeTruthy();
    expect(getByTestId("photo-capture")).toBeTruthy();
  });
});
