import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ModernInput } from "../ModernInput";
import { haptics } from "@/services/haptics";

// Mock haptics
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

  it("renders clear button when showClearButton is true and value is present", () => {
    const { getByLabelText } = render(
      <ModernInput
        label="Username"
        value="testuser"
        onChangeText={() => {}}
        showClearButton
      />
    );
    expect(getByLabelText("Clear Username")).toBeTruthy();
  });

  it("calls onChangeText('') and triggers haptics when clear button is pressed", () => {
    const onChangeText = jest.fn();
    const { getByLabelText } = render(
      <ModernInput
        label="Username"
        value="testuser"
        onChangeText={onChangeText}
        showClearButton
      />
    );

    fireEvent.press(getByLabelText("Clear Username"));
    expect(onChangeText).toHaveBeenCalledWith("");
    expect(haptics.light).toHaveBeenCalled();
  });

  it("triggers haptics when password visibility is toggled", () => {
    const { getByLabelText } = render(
      <ModernInput
        label="Password"
        value="secret"
        onChangeText={() => {}}
        secureTextEntry
      />
    );

    fireEvent.press(getByLabelText("Show password"));
    expect(haptics.light).toHaveBeenCalled();
  });

  it("renders non-interactive icon without button accessibility role", () => {
    const { queryByRole, queryByLabelText } = render(
      <ModernInput
        label="Search"
        value="test"
        onChangeText={() => {}}
        icon="search"
      />
    );

    expect(queryByRole("button")).toBeNull();
    expect(queryByLabelText("Search action")).toBeNull();
  });

  it("renders interactive icon as accessible button and handles press", () => {
    const onIconPress = jest.fn();
    const { getByLabelText } = render(
      <ModernInput
        label="Search"
        value="test"
        onChangeText={() => {}}
        icon="search"
        onIconPress={onIconPress}
      />
    );

    const iconButton = getByLabelText("Search action");
    expect(iconButton).toBeTruthy();
    fireEvent.press(iconButton);
    expect(onIconPress).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalled();
  });
});
