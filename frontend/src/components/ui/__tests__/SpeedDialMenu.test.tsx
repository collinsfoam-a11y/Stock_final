import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { SpeedDialMenu, SpeedDialAction } from "../SpeedDialMenu";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    medium: jest.fn(),
    light: jest.fn(),
  },
}));

describe("SpeedDialMenu", () => {
  const sampleActions: SpeedDialAction[] = [
    {
      icon: "add",
      label: "Add Item",
      onPress: jest.fn(),
    },
    {
      icon: "trash",
      label: "Delete Item",
      onPress: jest.fn(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders main toggle button with accessibility properties", () => {
    const { getByLabelText } = render(<SpeedDialMenu actions={sampleActions} />);
    const mainButton = getByLabelText("Open quick actions");

    expect(mainButton).toBeTruthy();
    expect(mainButton.props.accessibilityRole).toBe("button");
    expect(mainButton.props.accessibilityState.expanded).toBe(false);
  });

  it("opens menu and triggers medium haptics on main button press", () => {
    const { getByLabelText } = render(<SpeedDialMenu actions={sampleActions} />);
    const mainButton = getByLabelText("Open quick actions");

    fireEvent.press(mainButton);

    expect(haptics.medium).toHaveBeenCalledTimes(1);
    expect(getByLabelText("Close quick actions")).toBeTruthy();
    expect(getByLabelText("Add Item")).toBeTruthy();
    expect(getByLabelText("Delete Item")).toBeTruthy();
  });

  it("triggers action onPress and light haptics when an action item is pressed", () => {
    const { getByLabelText } = render(<SpeedDialMenu actions={sampleActions} />);

    // Open menu
    fireEvent.press(getByLabelText("Open quick actions"));

    // Press action
    const actionButton = getByLabelText("Add Item");
    fireEvent.press(actionButton);

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(sampleActions[0].onPress).toHaveBeenCalledTimes(1);
    // Menu should be closed after pressing an action
    expect(getByLabelText("Open quick actions")).toBeTruthy();
  });

  it("closes menu when backdrop overlay is pressed", () => {
    const { getByLabelText } = render(<SpeedDialMenu actions={sampleActions} />);

    // Open menu
    fireEvent.press(getByLabelText("Open quick actions"));

    // Press backdrop
    const backdrop = getByLabelText("Close menu");
    fireEvent.press(backdrop);

    expect(haptics.medium).toHaveBeenCalledTimes(2); // Once for open, once for close
    expect(getByLabelText("Open quick actions")).toBeTruthy();
  });
});
