import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Chip } from "../Chip";
import { haptics } from "@/services/haptics";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn().mockResolvedValue(undefined),
  },
}));

describe("Chip", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with label", () => {
    const { getByText } = render(<Chip label="Test Chip" />);
    expect(getByText("Test Chip")).toBeTruthy();
  });

  it("calls onPress and triggers haptic feedback when pressed", () => {
    const onPress = jest.fn();
    const { getByText } = render(<Chip label="Press Me" onPress={onPress} />);

    fireEvent.press(getByText("Press Me"));

    expect(onPress).toHaveBeenCalled();
    expect(haptics.light).toHaveBeenCalled();
  });

  it("calls onRemove and triggers haptic feedback when remove button is pressed", () => {
    const onRemove = jest.fn();
    const { getByLabelText } = render(
      <Chip label="Removable" onRemove={onRemove} />
    );

    fireEvent.press(getByLabelText("Remove Removable"));

    expect(onRemove).toHaveBeenCalled();
    expect(haptics.light).toHaveBeenCalled();
  });

  it("does not trigger haptic or callback when disabled", () => {
    const onPress = jest.fn();
    const onRemove = jest.fn();
    const { getByText, queryByLabelText } = render(
      <Chip label="Disabled" onPress={onPress} onRemove={onRemove} disabled={true} />
    );

    fireEvent.press(getByText("Disabled"));

    const removeButton = queryByLabelText("Remove Disabled");
    if (removeButton) {
        fireEvent.press(removeButton);
    }

    expect(onPress).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
  });

  it("has correct accessibility roles", () => {
    const { getAllByRole, getByLabelText } = render(
      <Chip label="Accessible" onPress={() => {}} onRemove={() => {}} />
    );

    const buttons = getAllByRole("button");
    expect(buttons.length).toBe(2); // Main container and remove button
    expect(getByLabelText("Remove Accessible")).toBeTruthy(); // Remove button
  });
});
