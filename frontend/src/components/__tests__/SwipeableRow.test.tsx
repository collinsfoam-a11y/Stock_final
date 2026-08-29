import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { SwipeableRow } from "../SwipeableRow";
import { haptics } from "@/services/haptics";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn().mockResolvedValue(undefined),
  },
}));

describe("SwipeableRow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders children correctly", () => {
    const { getByText } = render(
      <SwipeableRow>
        <Text>Item Content</Text>
      </SwipeableRow>
    );

    expect(getByText("Item Content")).toBeTruthy();
  });

  it("renders left and right action buttons with accessibility properties and triggers haptics on press", () => {
    const onLeftAction = jest.fn();
    const onRightAction = jest.fn();

    const { getByText } = render(
      <SwipeableRow
        leftLabel="Archive"
        rightLabel="Delete"
        onLeftAction={onLeftAction}
        onRightAction={onRightAction}
      >
        <Text>Item Content</Text>
      </SwipeableRow>
    );

    const leftButton = getByText("Archive");
    const rightButton = getByText("Delete");

    expect(leftButton).toBeTruthy();
    expect(rightButton).toBeTruthy();

    fireEvent.press(leftButton);
    expect(onLeftAction).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalledTimes(1);

    fireEvent.press(rightButton);
    expect(onRightAction).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalledTimes(2);
  });
});
