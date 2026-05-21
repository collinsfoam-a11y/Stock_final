import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ModernInput } from "../ModernInput";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

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

  it("renders clear button when showClearButton is true and has value", () => {
    const onChangeText = jest.fn();
    const { getByLabelText } = render(
      <ModernInput
        showClearButton
        label="Search"
        value="test query"
        onChangeText={onChangeText}
      />
    );

    const clearButton = getByLabelText("Clear Search");
    expect(clearButton).toBeTruthy();

    fireEvent.press(clearButton);
    expect(onChangeText).toHaveBeenCalledWith("");
    expect(haptics.light).toHaveBeenCalled();
  });

  it("toggles password visibility and triggers haptics", () => {
    const { getByLabelText, queryByLabelText } = render(
      <ModernInput
        secureTextEntry
        value="password123"
        onChangeText={() => {}}
      />
    );

    const showButton = getByLabelText("Show password");
    expect(showButton).toBeTruthy();

    fireEvent.press(showButton);
    expect(haptics.light).toHaveBeenCalled();
    expect(queryByLabelText("Show password")).toBeNull();
    expect(getByLabelText("Hide password")).toBeTruthy();
  });
});
