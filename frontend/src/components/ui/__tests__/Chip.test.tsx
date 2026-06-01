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

describe("Chip Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with label", () => {
    const { getByText } = render(<Chip label="Test Chip" />);
    expect(getByText("Test Chip")).toBeTruthy();
  });

  it("triggers onPress and haptics when pressed", () => {
    const onPressMock = jest.fn();
    const { getByText } = render(<Chip label="Press Me" onPress={onPressMock} />);

    fireEvent.press(getByText("Press Me"));

    expect(onPressMock).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it("triggers onRemove and haptics when remove button is pressed", () => {
    const onRemoveMock = jest.fn();
    const { getByLabelText } = render(<Chip label="Remove Me" onRemove={onRemoveMock} />);

    fireEvent.press(getByLabelText("Remove Remove Me"));

    expect(onRemoveMock).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it("does not trigger onPress or haptics when disabled", () => {
    const onPressMock = jest.fn();
    const { getByText } = render(<Chip label="Disabled" onPress={onPressMock} disabled />);

    fireEvent.press(getByText("Disabled"));

    expect(onPressMock).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
  });

  it("has correct accessibility attributes for interactive state", () => {
    const { getByLabelText } = render(<Chip label="A11y" onPress={() => {}} />);
    const chip = getByLabelText("Chip: A11y");

    expect(chip.props.accessibilityRole).toBe("button");
  });

  it("has correct accessibility attributes for remove button", () => {
    const { getByLabelText } = render(<Chip label="Removable" onRemove={() => {}} />);
    const removeButton = getByLabelText("Remove Removable");

    expect(removeButton.props.accessibilityRole).toBe("button");
  });
});
