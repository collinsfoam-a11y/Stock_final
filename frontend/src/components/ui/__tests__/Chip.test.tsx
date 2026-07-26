import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Chip } from "../Chip";
import { haptics } from "@/services/haptics";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
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

  it("calls onPress and triggers haptics when pressed", () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Chip label="Press Me" onPress={onPress} />);

    fireEvent.press(getByRole("button"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalled();
  });

  it("calls onRemove and triggers haptics when remove button is pressed", () => {
    const onRemove = jest.fn();
    const { getByLabelText } = render(
      <Chip label="Removable" onRemove={onRemove} />
    );

    const removeButton = getByLabelText("Remove Removable");
    fireEvent.press(removeButton);

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalled();
  });

  it("has correct accessibility role and label when interactive", () => {
    const { getByRole } = render(<Chip label="Interactive" onPress={() => {}} />);
    const chip = getByRole("button");

    expect(chip.props.accessibilityLabel).toBe("Interactive");
  });

  it("applies correct accessibilityState when selected", () => {
    const { getByRole } = render(
      <Chip label="Selected" onPress={() => {}} selected={true} />
    );
    const chip = getByRole("button");

    expect(chip.props.accessibilityState.selected).toBe(true);
  });

  it("does not trigger onPress or haptics when disabled", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Chip label="Disabled" onPress={onPress} disabled={true} />
    );

    fireEvent.press(getByText("Disabled"));

    expect(onPress).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
  });
});
