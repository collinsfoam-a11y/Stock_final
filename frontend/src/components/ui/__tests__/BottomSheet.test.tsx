import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { BottomSheet } from "../BottomSheet";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("BottomSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders children when visible", () => {
    const { getByText } = render(
      <BottomSheet visible={true} onClose={jest.fn()}>
        <Text>Bottom Sheet Content</Text>
      </BottomSheet>
    );

    expect(getByText("Bottom Sheet Content")).toBeTruthy();
    expect(haptics.light).toHaveBeenCalled();
  });

  it("does not render when not visible", () => {
    const { queryByText } = render(
      <BottomSheet visible={false} onClose={jest.fn()}>
        <Text>Bottom Sheet Content</Text>
      </BottomSheet>
    );

    expect(queryByText("Bottom Sheet Content")).toBeNull();
  });

  it("handles backdrop press and triggers haptic feedback", () => {
    const onClose = jest.fn();
    const { UNSAFE_getByProps } = render(
      <BottomSheet visible={true} onClose={onClose}>
        <Text>Bottom Sheet Content</Text>
      </BottomSheet>
    );

    const backdrop = UNSAFE_getByProps({ accessibilityLabel: "Close modal backdrop" });
    expect(backdrop).toBeTruthy();
    expect(backdrop.props.accessibilityHint).toBe("Dismisses bottom sheet modal");
    expect(backdrop.props.accessibilityRole).toBe("button");

    fireEvent.press(backdrop);
    expect(haptics.light).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
