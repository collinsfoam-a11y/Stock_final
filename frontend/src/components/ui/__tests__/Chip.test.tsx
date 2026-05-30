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

  it("triggers haptics and onPress callback when pressed", () => {
    const onPressMock = jest.fn();
    const { getByText } = render(<Chip label="Press Me" onPress={onPressMock} />);

    fireEvent.press(getByText("Press Me"));

    expect(onPressMock).toHaveBeenCalled();
    expect(haptics.light).toHaveBeenCalled();
  });

  it("triggers haptics and onRemove callback when remove button is pressed", () => {
    const onRemoveMock = jest.fn();
    const { getByRole } = render(<Chip label="Remove Me" onRemove={onRemoveMock} />);

    const removeButton = getByRole("button", { name: /remove remove me/i });
    fireEvent.press(removeButton);

    expect(onRemoveMock).toHaveBeenCalled();
    expect(haptics.light).toHaveBeenCalled();
  });

  it("does not trigger onPress or haptics when disabled", () => {
    const onPressMock = jest.fn();
    const { getByText } = render(<Chip label="Disabled" onPress={onPressMock} disabled />);

    fireEvent.press(getByText("Disabled"));

    expect(onPressMock).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
  });

  it("applies correct accessibility attributes when interactive", () => {
    const { getByRole } = render(<Chip label="Accessible" onPress={() => {}} />);
    const chip = getByRole("button", { name: /accessible/i });

    expect(chip.props.accessibilityRole).toBe("button");
    expect(chip.props.accessibilityLabel).toBe("Accessible");
  });

  it("applies selected state to accessibility label", () => {
    const { getByRole } = render(<Chip label="Selected" onPress={() => {}} selected />);
    const chip = getByRole("button", { name: /selected, selected/i });

    expect(chip.props.accessibilityLabel).toBe("Selected, Selected");
    expect(chip.props.accessibilityState.selected).toBe(true);
  });
});
