import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ModernInput } from "../ModernInput";

describe("ModernInput", () => {
  it("renders correctly with label", () => {
    const { getByText } = render(
      <ModernInput
        label="Test Label"
        value=""
        onChangeText={() => {}}
      />
    );
    expect(getByText("Test Label")).toBeTruthy();
  });

  it("calls onChangeText when text changes", () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = render(
      <ModernInput
        placeholder="Enter text"
        value=""
        onChangeText={onChangeText}
      />
    );

    fireEvent.changeText(getByPlaceholderText("Enter text"), "Hello");
    expect(onChangeText).toHaveBeenCalledWith("Hello");
  });

  it("renders helper text", () => {
    const { getByText } = render(
      <ModernInput
        value=""
        onChangeText={() => {}}
        helperText="Helper message"
      />
    );

    expect(getByText("Helper message")).toBeTruthy();
  });

  it("respects disabled state on the input", () => {
    const { getByTestId } = render(
      <ModernInput
        disabled
        testID="modern-input"
        value="Some text"
        onChangeText={() => {}}
      />
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
});
