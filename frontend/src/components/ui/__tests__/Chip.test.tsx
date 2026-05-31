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
    const { getByRole } = render(<Chip label="Press Me" onPress={onPress} />);

    fireEvent.press(getByRole("button"));

    expect(onPress).toHaveBeenCalled();
    expect(haptics.light).toHaveBeenCalled();
  });

  it("calls onRemove when remove icon is pressed", () => {
    const onRemove = jest.fn();
    const { getByLabelText } = render(<Chip label="Removable" onRemove={onRemove} />);

    fireEvent.press(getByLabelText("Remove Removable"));

    expect(onRemove).toHaveBeenCalled();
    expect(haptics.light).toHaveBeenCalled();
  });

  it("does not call onPress when disabled", () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Chip label="Disabled" onPress={onPress} disabled />);

    const button = getByRole("button");
    expect(button.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
  });

  it("applies correct accessibility state for selected", () => {
    const { getByRole } = render(<Chip label="Selected" onPress={() => {}} selected />);

    expect(getByRole("button").props.accessibilityState.selected).toBe(true);
  });

  it("applies correct accessibility role for interactive chip", () => {
    const { getByRole } = render(<Chip label="Interactive" onPress={() => {}} />);
    expect(getByRole("button")).toBeTruthy();
  });

  it("does not have button role when not interactive", () => {
    const { queryByRole } = render(<Chip label="Static" />);
    expect(queryByRole("button")).toBeNull();
  });
});
