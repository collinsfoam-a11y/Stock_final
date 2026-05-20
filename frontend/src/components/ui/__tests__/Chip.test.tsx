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

  it("calls onPress when pressed", () => {
    const onPress = jest.fn();
    const { getByText } = render(<Chip label="Pressable" onPress={onPress} />);

    fireEvent.press(getByText("Pressable"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("triggers haptics on press", () => {
    const onPress = jest.fn();
    const { getByText } = render(<Chip label="Haptic" onPress={onPress} />);

    fireEvent.press(getByText("Haptic"));
    expect(haptics.light).toHaveBeenCalled();
  });

  it("calls onRemove when remove button is pressed", () => {
    const onRemove = jest.fn();
    const { getByLabelText } = render(<Chip label="Removable" onRemove={onRemove} />);

    const removeButton = getByLabelText("Remove Removable");
    fireEvent.press(removeButton);

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("triggers haptics on remove press", () => {
    const onRemove = jest.fn();
    const { getByLabelText } = render(<Chip label="Removable" onRemove={onRemove} />);

    const removeButton = getByLabelText("Remove Removable");
    fireEvent.press(removeButton);

    expect(haptics.light).toHaveBeenCalled();
  });

  it("applies correct accessibility role and state to main container", () => {
    const { getByRole } = render(<Chip label="Selectable" onPress={() => {}} selected={true} />);

    const chip = getByRole("button");
    expect(chip.props.accessibilityState.selected).toBe(true);
  });

  it("applies disabled state to accessibilityState", () => {
    const { getByRole } = render(<Chip label="Disabled" onPress={() => {}} disabled={true} />);

    const chip = getByRole("button");
    expect(chip.props.accessibilityState.disabled).toBe(true);
  });
});
