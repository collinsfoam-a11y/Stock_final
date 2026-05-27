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

  it("applies accessibilityRole='button' when interactive", () => {
    const { getByRole } = render(<Chip label="Interactive" onPress={() => {}} />);
    expect(getByRole("button")).toBeTruthy();
  });

  it("triggers haptics and calls onPress when pressed", () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Chip label="Press Me" onPress={onPress} />);

    fireEvent.press(getByRole("button"));

    expect(haptics.light).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalled();
  });

  it("triggers haptics and calls onRemove when remove button is pressed", () => {
    const onRemove = jest.fn();
    const { getByLabelText } = render(
      <Chip label="Removable" onRemove={onRemove} />
    );

    const removeButton = getByLabelText("Remove Removable");
    fireEvent.press(removeButton);

    expect(haptics.light).toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalled();
  });

  it("applies correct accessibilityState", () => {
    const { getByLabelText, rerender } = render(
      <Chip label="Stateful" selected={true} disabled={false} />
    );

    const chip = getByLabelText("Stateful");
    expect(chip.props.accessibilityState.selected).toBe(true);
    expect(chip.props.accessibilityState.disabled).toBe(false);

    rerender(<Chip label="Stateful" selected={false} disabled={true} />);
    expect(chip.props.accessibilityState.selected).toBe(false);
    expect(chip.props.accessibilityState.disabled).toBe(true);
  });

  it("does not trigger haptics or onPress when disabled", () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <Chip label="Disabled" onPress={onPress} disabled={true} />
    );

    const chip = getByLabelText("Disabled");
    fireEvent.press(chip);

    expect(haptics.light).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });
});
