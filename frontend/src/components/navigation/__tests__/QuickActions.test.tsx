import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { QuickActions } from "../QuickActions";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("QuickActions", () => {
  const mockOnPress1 = jest.fn();
  const mockOnPress2 = jest.fn();

  const actions = [
    {
      id: "action-1",
      label: "Scan Item",
      icon: "barcode-outline" as const,
      onPress: mockOnPress1,
    },
    {
      id: "action-2",
      label: "View Alerts",
      icon: "alert-circle-outline" as const,
      onPress: mockOnPress2,
      badge: 5,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders action items correctly", () => {
    const { getByText, getByLabelText } = render(<QuickActions actions={actions} />);

    expect(getByText("Scan Item")).toBeTruthy();
    expect(getByText("View Alerts")).toBeTruthy();
    expect(getByText("5")).toBeTruthy();

    expect(getByLabelText("Scan Item")).toBeTruthy();
    expect(getByLabelText("View Alerts, 5 notifications")).toBeTruthy();
  });

  it("triggers onPress and haptics when action button is pressed", () => {
    const { getByLabelText } = render(<QuickActions actions={actions} />);

    fireEvent.press(getByLabelText("Scan Item"));

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(mockOnPress1).toHaveBeenCalledTimes(1);
  });

  it("renders in compact mode", () => {
    const { getByText } = render(<QuickActions actions={actions} compact />);

    expect(getByText("Scan Item")).toBeTruthy();
  });
});
