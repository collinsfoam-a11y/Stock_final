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

  it("shows clear button when showClearButton is true and value is present", () => {
    const { getByLabelText } = render(
      <ModernInput
        showClearButton
        value="Some text"
        onChangeText={() => {}}
      />
    );

    expect(getByLabelText("Clear text")).toBeTruthy();
  });

  it("calls onChangeText with empty string when clear button is pressed", () => {
    const onChangeText = jest.fn();
    const { getByLabelText } = render(
      <ModernInput
        showClearButton
        value="Some text"
        onChangeText={onChangeText}
      />
    );

    fireEvent.press(getByLabelText("Clear text"));
    expect(onChangeText).toHaveBeenCalledWith("");
  });

  it("does not show clear button when input is empty", () => {
    const { queryByLabelText } = render(
      <ModernInput
        showClearButton
        value=""
        onChangeText={() => {}}
      />
    );

    expect(queryByLabelText("Clear text")).toBeNull();
  });

  it("does not show clear button for password fields", () => {
    const { queryByLabelText } = render(
      <ModernInput
        showClearButton
        secureTextEntry
        value="password"
        onChangeText={() => {}}
      />
    );

    expect(queryByLabelText("Clear text")).toBeNull();
  });
});
