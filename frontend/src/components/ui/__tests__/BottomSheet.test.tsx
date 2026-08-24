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
      <BottomSheet visible={true} onClose={() => {}}>
        <Text>Sheet Content</Text>
      </BottomSheet>
    );

    expect(getByText("Sheet Content")).toBeTruthy();
  });

  it("does not render content when not visible", () => {
    const { queryByText } = render(
      <BottomSheet visible={false} onClose={() => {}}>
        <Text>Sheet Content</Text>
      </BottomSheet>
    );

    expect(queryByText("Sheet Content")).toBeNull();
  });

  it("has backdrop with accessibility role and label, and triggers haptics and onClose on press", () => {
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <BottomSheet visible={true} onClose={onClose}>
        <Text>Sheet Content</Text>
      </BottomSheet>
    );

    const closeTouchable = getByLabelText("Close bottom sheet");
    expect(closeTouchable).toBeTruthy();
    expect(closeTouchable.props.accessibilityRole).toBe("button");

    fireEvent.press(closeTouchable);
    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
