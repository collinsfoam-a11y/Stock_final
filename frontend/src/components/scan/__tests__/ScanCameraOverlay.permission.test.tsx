import { fireEvent, render } from "@testing-library/react-native";
import { Linking } from "react-native";

import { ScanCameraOverlay } from "../ScanCameraOverlay";

jest.mock("@/services/device/visionCamera", () => ({
  Camera: "Camera",
  useCameraDevice: () => null,
  useCodeScanner: () => ({}),
}));

jest.mock("@/components/ui/ModernButton", () => {
  const React = require("react");
  const { Text, TouchableOpacity } = require("react-native");

  return function MockModernButton({
    onPress,
    title,
  }: {
    onPress: () => void;
    title: string;
  }) {
    return (
      <TouchableOpacity onPress={onPress} accessibilityRole="button">
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  };
});

const baseProps = {
  animatedCorners: {},
  animatedScanLine: {},
  onBarcodeScanned: jest.fn(),
  onClose: jest.fn(),
  requestPermission: jest.fn(),
  scanned: false,
};

describe("ScanCameraOverlay permission handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  });

  it("requests camera permission when permission can still be requested", () => {
    const requestPermission = jest.fn();
    const { getByText, queryByText } = render(
      <ScanCameraOverlay
        {...baseProps}
        permission={{ granted: false, canAskAgain: true }}
        requestPermission={requestPermission}
      />,
    );

    fireEvent.press(getByText("Grant Permission"));

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(queryByText("Open Settings")).toBeNull();
  });

  it("opens system settings when permission is permanently denied", () => {
    const { getByText, queryByText } = render(
      <ScanCameraOverlay
        {...baseProps}
        permission={{ granted: false, canAskAgain: false }}
      />,
    );

    fireEvent.press(getByText("Open Settings"));

    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    expect(queryByText("Grant Permission")).toBeNull();
  });

  it("routes to manual entry when the browser cannot request camera access", () => {
    const onClose = jest.fn();
    const { getByText, queryByText } = render(
      <ScanCameraOverlay
        {...baseProps}
        onClose={onClose}
        permission={{
          granted: false,
          canAskAgain: false,
          unavailableReason: "Camera needs HTTPS in a mobile browser.",
        }}
      />,
    );

    fireEvent.press(getByText("Use Manual Entry"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(queryByText("Grant Permission")).toBeNull();
    expect(queryByText("Open Settings")).toBeNull();
  });
});
