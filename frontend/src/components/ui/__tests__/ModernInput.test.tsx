import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

import { haptics } from "@/services/haptics";

import { ModernInput } from "../ModernInput";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("ModernInput", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with label", () => {
    const { getByText } = render(
      <ModernInput label="Test Label" value="" onChangeText={() => {}} />
    );
    expect(getByText("Test Label")).toBeTruthy();
  });

  it("calls onChangeText when text changes", () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = render(
      <ModernInput placeholder="Enter text" value="" onChangeText={onChangeText} />
    );

    fireEvent.changeText(getByPlaceholderText("Enter text"), "Hello");
    expect(onChangeText).toHaveBeenCalledWith("Hello");
  });

  it("renders helper text", () => {
    const { getByText } = render(
      <ModernInput value="" onChangeText={() => {}} helperText="Helper message" />
    );

    expect(getByText("Helper message")).toBeTruthy();
  });

  it("respects disabled state on the input", () => {
    const { getByTestId } = render(
      <ModernInput disabled testID="modern-input" value="Some text" onChangeText={() => {}} />
    );

    expect(getByTestId("modern-input").props.editable).toBe(false);
  });

  it("disables password visibility toggle when input is disabled", () => {
    const { getByLabelText, getByPlaceholderText } = render(
      <ModernInput
        disabled
        placeholder="Password"
        value="secret"
        secureTextEntry
        onChangeText={() => {}}
      />
    );

    const toggle = getByLabelText("Show password");
    fireEvent.press(toggle);

    expect(toggle.props.accessibilityState).toEqual({ disabled: true });
    expect(getByPlaceholderText("Password").props.secureTextEntry).toBe(true);
  });

  it("shows clear button and clears text when pressed", () => {
    const onChangeText = jest.fn();
    const { getByLabelText, queryByLabelText, rerender } = render(
      <ModernInput label="Username" showClearButton value="staff1" onChangeText={onChangeText} />
    );

    fireEvent.press(getByLabelText("Clear input"));

    expect(onChangeText).toHaveBeenCalledWith("");
    expect(haptics.light).toHaveBeenCalledTimes(1);

    rerender(<ModernInput showClearButton value="" onChangeText={onChangeText} />);

    expect(queryByLabelText("Clear input")).toBeNull();
  });

  it("toggles password visibility and triggers haptics", () => {
    const { getByLabelText, getByPlaceholderText } = render(
      <ModernInput
        placeholder="Password"
        secureTextEntry
        value="password123"
        onChangeText={() => {}}
      />
    );

    fireEvent.press(getByLabelText("Show password"));

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(getByLabelText("Hide password")).toBeTruthy();
    expect(getByPlaceholderText("Password").props.secureTextEntry).toBe(false);
  });
});
