import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { SwipeableRow } from "../SwipeableRow";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

jest.mock("react-native-gesture-handler", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Swipeable: ({ children, renderLeftActions, renderRightActions }: any) => (
      <View testID="mock-swipeable">
        {renderLeftActions && renderLeftActions()}
        {children}
        {renderRightActions && renderRightActions()}
      </View>
    ),
  };
});

describe("SwipeableRow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders children correctly", () => {
    const { getByText } = render(
      <SwipeableRow>
        <Text>Row Content</Text>
      </SwipeableRow>
    );
    expect(getByText("Row Content")).toBeTruthy();
  });

  it("renders left action and triggers haptics and callback on press", () => {
    const onLeftAction = jest.fn();
    const { getByRole, getByText } = render(
      <SwipeableRow leftLabel="Approve" onLeftAction={onLeftAction}>
        <Text>Row Content</Text>
      </SwipeableRow>
    );

    const leftButton = getByRole("button", { name: "Approve" });
    expect(leftButton).toBeTruthy();
    expect(leftButton.props.accessibilityHint).toBe("Approve action");

    fireEvent.press(getByText("Approve"));

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onLeftAction).toHaveBeenCalledTimes(1);
  });

  it("renders right action and triggers haptics and callback on press", () => {
    const onRightAction = jest.fn();
    const { getByRole, getByText } = render(
      <SwipeableRow rightLabel="Delete" onRightAction={onRightAction}>
        <Text>Row Content</Text>
      </SwipeableRow>
    );

    const rightButton = getByRole("button", { name: "Delete" });
    expect(rightButton).toBeTruthy();
    expect(rightButton.props.accessibilityHint).toBe("Delete action");

    fireEvent.press(getByText("Delete"));

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onRightAction).toHaveBeenCalledTimes(1);
  });
});
