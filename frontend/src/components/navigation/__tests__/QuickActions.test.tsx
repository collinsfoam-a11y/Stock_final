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
      id: "alerts",
      label: "Alerts",
      icon: "notifications-outline" as const,
      badge: 3,
      onPress: jest.fn(),
    },
  ];

  it("renders action buttons with labels", () => {
    const { getByText } = render(<QuickActions actions={mockActions} />);
    expect(getByText("Scan Item")).toBeTruthy();
    expect(getByText("Alerts")).toBeTruthy();
    expect(getByText("3")).toBeTruthy();
  });

  it("triggers onPress and haptics.light when an action button is pressed", () => {
    const { getByLabelText } = render(<QuickActions actions={mockActions} />);
    const scanButton = getByLabelText("Scan Item");

    fireEvent.press(scanButton);

    expect(mockActions[0]?.onPress).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it("applies accessibility label with badge notification count when badge > 0", () => {
    const { getByLabelText } = render(<QuickActions actions={mockActions} />);
    const alertsButton = getByLabelText("Alerts, 3 unread notifications");

    expect(alertsButton).toBeTruthy();
    expect(alertsButton.props?.accessibilityRole).toBe("button");
  });
});
