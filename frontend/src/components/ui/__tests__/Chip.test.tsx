import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { haptics } from "@/services/haptics";

import { Chip } from "../Chip";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("Chip", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the label", () => {
    const { getByText } = render(<Chip label="Test Chip" />);

    expect(getByText("Test Chip")).toBeTruthy();
  });

  it("calls onPress and haptics when pressed", () => {
    const onPress = jest.fn();
    const { getByText } = render(<Chip label="Pressable" onPress={onPress} />);

    fireEvent.press(getByText("Pressable"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it("calls onRemove and haptics when the remove button is pressed", () => {
    const onRemove = jest.fn();
    const { getByLabelText } = render(<Chip label="Removable" onRemove={onRemove} />);

    fireEvent.press(getByLabelText("Remove Removable"));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it("exposes selected accessibility state for interactive chips", () => {
    const { getByRole } = render(<Chip label="Selectable" onPress={() => {}} selected />);

    expect(getByRole("button").props.accessibilityState.selected).toBe(true);
  });

  it("exposes disabled accessibility state for interactive chips", () => {
    const { getByRole } = render(<Chip label="Disabled" onPress={() => {}} disabled />);

    expect(getByRole("button").props.accessibilityState.disabled).toBe(true);
  });
});
