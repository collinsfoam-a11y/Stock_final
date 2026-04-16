import React from "react";
import { render, waitFor } from "@testing-library/react-native";

import LogsScreen from "../logs";

const mockBack = jest.fn();
const mockGetServiceLogs = jest.fn();
const mockHasRole = jest.fn(() => true);
const mockRouter = {
  back: mockBack,
};

let mockOfflineMode = false;

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({
    service: "backend",
  }),
}));

jest.mock("../../../src/hooks/usePermission", () => ({
  usePermission: () => ({
    hasRole: mockHasRole,
  }),
}));

jest.mock("../../../src/services/api", () => ({
  getServiceLogs: (...args: unknown[]) => mockGetServiceLogs(...args),
}));

jest.mock("../../../src/store/settingsStore", () => ({
  useSettingsStore: (
    selector: (state: { settings: { offlineMode: boolean } }) => unknown,
  ) =>
    selector({
      settings: {
        offlineMode: mockOfflineMode,
      },
    }),
}));

jest.mock("@/components/ui", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text, TouchableOpacity, View } = require("react-native");

  return {
    AnimatedPressable: ({
      children,
      onPress,
      ...props
    }: {
      children: React.ReactNode;
      onPress?: () => void;
    }) =>
      React.createElement(TouchableOpacity, { onPress, ...props }, children),
    ScreenContainer: ({
      children,
      header,
    }: {
      children: React.ReactNode;
      header?: {
        title?: string;
        subtitle?: string;
        customRightContent?: React.ReactNode;
      };
    }) =>
      React.createElement(
        View,
        null,
        header?.title ? React.createElement(Text, null, header.title) : null,
        header?.subtitle
          ? React.createElement(Text, null, header.subtitle)
          : null,
        header?.customRightContent || null,
        children,
      ),
  };
});

describe("LogsScreen offline mode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOfflineMode = false;
    mockHasRole.mockReturnValue(true);
  });

  it("does not request service logs while offline mode is enabled", async () => {
    mockOfflineMode = true;

    const { getByText } = render(<LogsScreen />);

    await waitFor(() => {
      expect(
        getByText(
          "Service logs are fetched from the backend and are not cached on this device. Reconnect to inspect live log output.",
        ),
      ).toBeTruthy();
    });

    expect(mockGetServiceLogs).not.toHaveBeenCalled();
    expect(getByText("BACKEND Logs")).toBeTruthy();
  });
});
