import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { PinKeypad } from "../PinKeypad";
import { haptics } from "@/services/haptics";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
    error: jest.fn(),
  },
}));

describe("PinKeypad", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders keypad numbers and indicators correctly", () => {
    const { getByText, getByLabelText } = render(
      <PinKeypad pin="12" onPinChange={jest.fn()} />
    );

    expect(getByText("1")).toBeTruthy();
    expect(getByText("9")).toBeTruthy();
    expect(getByText("C")).toBeTruthy();
    expect(getByLabelText("PIN entry: 2 of 4 digits entered")).toBeTruthy();
  });

  it("triggers onPinChange and haptics when number keys are pressed", () => {
    const onPinChange = jest.fn();
    const { getByText } = render(
      <PinKeypad pin="12" onPinChange={onPinChange} />
    );

    fireEvent.press(getByText("3"));
    expect(onPinChange).toHaveBeenCalledWith("123");
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it("calls onComplete when PIN reaches max length", () => {
    const onPinChange = jest.fn();
    const onComplete = jest.fn();
    const { getByText } = render(
      <PinKeypad
        pin="123"
        maxLength={4}
        onPinChange={onPinChange}
        onComplete={onComplete}
      />
    );

    fireEvent.press(getByText("4"));
    expect(onPinChange).toHaveBeenCalledWith("1234");
    expect(onComplete).toHaveBeenCalledWith("1234");
  });

  it("handles backspace key press", () => {
    const onPinChange = jest.fn();
    const { getByLabelText } = render(
      <PinKeypad pin="123" onPinChange={onPinChange} />
    );

    fireEvent.press(getByLabelText("Delete"));
    expect(onPinChange).toHaveBeenCalledWith("12");
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it("handles clear key press", () => {
    const onPinChange = jest.fn();
    const { getByLabelText } = render(
      <PinKeypad pin="123" onPinChange={onPinChange} />
    );

    fireEvent.press(getByLabelText("Clear"));
    expect(onPinChange).toHaveBeenCalledWith("");
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it("does not trigger callbacks or haptics when disabled", () => {
    const onPinChange = jest.fn();
    const { getByText } = render(
      <PinKeypad pin="12" disabled onPinChange={onPinChange} />
    );

    fireEvent.press(getByText("3"));
    expect(onPinChange).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
  });

  it("triggers error haptics when error prop is true", () => {
    render(<PinKeypad pin="1234" error onPinChange={jest.fn()} />);

    expect(haptics.error).toHaveBeenCalledTimes(1);
  });

  it("marks internal backspace icon as decorative", () => {
    const { UNSAFE_getByType } = render(
      <PinKeypad pin="1" onPinChange={jest.fn()} />
    );

    const icon = UNSAFE_getByType(Ionicons);
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no");
  });
});
