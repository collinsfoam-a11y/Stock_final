import React from "react";
import * as ReactNative from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import SupervisorLayout from "../_layout";

const mockPush = jest.fn();

let mockOfflineMode = false;
let mockSegments: string[] = ["supervisor", "dashboard"];
const mockUseWindowDimensions = jest.spyOn(
  ReactNative,
  "useWindowDimensions",
);

jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require("react-native");

  const Stack = () => React.createElement(Text, { testID: "stack" }, "stack");
  // eslint-disable-next-line react/display-name
  Stack.Screen = () => null;

  return {
    Stack,
    Slot: () => React.createElement(Text, { testID: "slot" }, "slot"),
    useRouter: () => ({
      push: mockPush,
    }),
    useSegments: () => mockSegments,
  };
});

jest.mock("@/components/auth/RoleLayoutGuard", () => ({
  RoleLayoutGuard: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/components/navigation", () => ({
  SupervisorSidebar: () => null,
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
    GlassCard: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
    }) => React.createElement(View, props, children),
    ScreenContainer: ({
      children,
      header,
    }: {
      children: React.ReactNode;
      header?: { title?: string; subtitle?: string };
    }) =>
      React.createElement(
        View,
        null,
        header?.title ? React.createElement(Text, null, header.title) : null,
        header?.subtitle
          ? React.createElement(Text, null, header.subtitle)
          : null,
        children,
      ),
  };
});

jest.mock("@/store/settingsStore", () => ({
  useSettingsStore: (
    selector: (state: { settings: { offlineMode: boolean } }) => unknown,
  ) =>
    selector({
      settings: {
        offlineMode: mockOfflineMode,
      },
    }),
}));

describe("SupervisorLayout offline gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOfflineMode = false;
    mockSegments = ["supervisor", "dashboard"];
    mockUseWindowDimensions.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
  });

  afterAll(() => {
    mockUseWindowDimensions.mockRestore();
  });

  it("shows the offline fallback for blocked supervisor routes", () => {
    mockOfflineMode = true;
    mockSegments = ["supervisor", "dashboard"];

    const { getByText, queryByTestId } = render(<SupervisorLayout />);

    expect(
      getByText("This supervisor screen needs a live connection"),
    ).toBeTruthy();
    expect(queryByTestId("slot")).toBeNull();

    fireEvent.press(getByText("Items"));

    expect(mockPush).toHaveBeenCalledWith("/supervisor/items");
  });

  it("allows offline-safe supervisor routes through the layout", () => {
    mockOfflineMode = true;
    mockSegments = ["supervisor", "items"];

    const { getByTestId, queryByText } = render(<SupervisorLayout />);

    expect(queryByText("This supervisor screen needs a live connection")).toBeNull();
    expect(getByTestId("stack")).toBeTruthy();
  });

  it("keeps the cached sessions routes available offline", () => {
    mockOfflineMode = true;
    mockSegments = ["supervisor", "sessions"];

    const { getByTestId, queryByText, rerender } = render(<SupervisorLayout />);

    expect(queryByText("This supervisor screen needs a live connection")).toBeNull();
    expect(getByTestId("stack")).toBeTruthy();

    mockSegments = ["supervisor", "session", "session-1"];
    rerender(<SupervisorLayout />);

    expect(queryByText("This supervisor screen needs a live connection")).toBeNull();
    expect(getByTestId("stack")).toBeTruthy();
  });
});
