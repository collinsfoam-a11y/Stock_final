import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { QuickActions } from "../QuickActions";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("QuickActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockActions = [
    {
      id: "scan",
      label: "Scan Item",
      icon: "barcode-outline" as const,
      onPress: jest.fn(),
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: "notifications-outline" as const,
      badge: 5,
      onPress: jest.fn(),
    },
    {
      id: "overflow",
      label: "Alerts",
      icon: "warning-outline" as const,
      badge: 120,
      onPress: jest.fn(),
    },
  ];

  it("renders quick action labels and badge values", () => {
    const { getByText } = render(<QuickActions actions={mockActions} />);

    expect(getByText("Scan Item")).toBeTruthy();
    expect(getByText("Notifications")).toBeTruthy();
    expect(getByText("5")).toBeTruthy();
    expect(getByText("99+")).toBeTruthy();
  });

  it("applies correct accessibility labels including unread badge counts", () => {
    const { getByLabelText } = render(<QuickActions actions={mockActions} />);

    expect(getByLabelText("Scan Item")).toBeTruthy();
    expect(getByLabelText("Notifications, 5 unread")).toBeTruthy();
    expect(getByLabelText("Alerts, 99+ unread")).toBeTruthy();
  });

  it("triggers haptics.light and action onPress when pressed", () => {
    const { getByLabelText } = render(<QuickActions actions={mockActions} />);

    fireEvent.press(getByLabelText("Scan Item"));

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(mockActions[0]!.onPress).toHaveBeenCalledTimes(1);
  });

  it("hides decorative Ionicons from screen readers", () => {
    const { UNSAFE_queryAllByType } = render(<QuickActions actions={mockActions} />);

    const Ionicons = require("@expo/vector-icons/Ionicons").default;
    const icons = UNSAFE_queryAllByType(Ionicons);

    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      expect(icon.props.accessibilityElementsHidden).toBe(true);
      expect(icon.props.importantForAccessibility).toBe("no");
    });
  });
});
