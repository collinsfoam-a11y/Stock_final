import { render, fireEvent } from "@testing-library/react-native";
import React from "react";
import { AppTouchable } from "../AppTouchable";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("AppTouchable", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("calls onPress and triggers light haptics when pressed", () => {
    const onPressMock = jest.fn();
    const { getByTestId } = render(
      <AppTouchable testID="app-touchable" onPress={onPressMock} />
    );

    fireEvent.press(getByTestId("app-touchable"));

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it("does not trigger haptics when there is no onPress handler", () => {
    const { getByTestId } = render(<AppTouchable testID="app-touchable" />);

    fireEvent.press(getByTestId("app-touchable"));

    expect(haptics.light).not.toHaveBeenCalled();
  });

  it("does not trigger onPress or haptics when disabled", () => {
    const onPressMock = jest.fn();
    const { getByTestId } = render(
      <AppTouchable testID="app-touchable" onPress={onPressMock} disabled={true} />
    );

    fireEvent.press(getByTestId("app-touchable"));

    expect(haptics.light).not.toHaveBeenCalled();
    expect(onPressMock).not.toHaveBeenCalled();
  });
});
