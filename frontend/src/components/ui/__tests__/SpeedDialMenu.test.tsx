import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

import { SpeedDialMenu, SpeedDialAction } from "../SpeedDialMenu";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
    medium: jest.fn(),
  },
}));

describe("SpeedDialMenu Component", () => {
  const mockAction1Press = jest.fn();
  const mockAction2Press = jest.fn();

  const actions: SpeedDialAction[] = [
    {
      icon: "add",
      label: "Add Item",
      onPress: mockAction1Press,
    },
    {
      icon: "notifications",
      label: "Alerts",
      onPress: mockAction2Press,
      badge: 3,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders main toggle button with expanded=false initially", () => {
    const { getByLabelText } = render(<SpeedDialMenu actions={actions} />);
    const mainButton = getByLabelText("Open quick actions");

    expect(mainButton).toBeTruthy();
    expect(mainButton.props.accessibilityRole).toBe("button");
    expect(mainButton.props.accessibilityState).toEqual({ expanded: false });
  });

  it("toggles menu open/close and triggers medium haptics on main button press", () => {
    const { getByLabelText, queryByLabelText } = render(<SpeedDialMenu actions={actions} />);

    // Open menu
    const openButton = getByLabelText("Open quick actions");
    fireEvent.press(openButton);

    expect(haptics.medium).toHaveBeenCalledTimes(1);
    expect(getByLabelText("Close quick actions")).toBeTruthy();
    expect(getByLabelText("Close quick actions").props.accessibilityState).toEqual({ expanded: true });

    // Backdrop should now be visible
    const backdrop = getByLabelText("Close quick actions menu");
    expect(backdrop).toBeTruthy();

    // Press backdrop to close menu
    fireEvent.press(backdrop);
    expect(haptics.medium).toHaveBeenCalledTimes(2);
    expect(queryByLabelText("Close quick actions menu")).toBeNull();
  });

  it("renders action buttons with accessibility labels and badge details", () => {
    const { getByLabelText } = render(<SpeedDialMenu actions={actions} />);

    // Open menu to expose actions
    fireEvent.press(getByLabelText("Open quick actions"));

    const action1Button = getByLabelText("Add Item");
    const action2Button = getByLabelText("Alerts, 3 notifications");

    expect(action1Button).toBeTruthy();
    expect(action2Button).toBeTruthy();
  });

  it("triggers action onPress and light haptic feedback on action click", () => {
    const { getByLabelText } = render(<SpeedDialMenu actions={actions} />);

    // Open menu
    fireEvent.press(getByLabelText("Open quick actions"));

    // Press action button
    const action1Button = getByLabelText("Add Item");
    fireEvent.press(action1Button);

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(mockAction1Press).toHaveBeenCalledTimes(1);
  });
});
