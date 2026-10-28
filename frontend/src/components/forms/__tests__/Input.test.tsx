import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Input } from "../Input";
import { ThemeProvider } from "../../../context/ThemeContext";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("Input Component", () => {
  const renderWithTheme = (ui: React.ReactElement) => {
    return render(<ThemeProvider>{ui}</ThemeProvider>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with label and applies computed accessibility label to TextInput", () => {
    const { getByLabelText, getByText } = renderWithTheme(
      <Input label="Username" placeholder="Enter username" />
    );

    expect(getByText("Username")).toBeTruthy();
    expect(getByLabelText("Username")).toBeTruthy();
  });

  it("uses placeholder as fallback accessibilityLabel when label is absent", () => {
    const { getByLabelText } = renderWithTheme(
      <Input placeholder="Search items..." />
    );

    expect(getByLabelText("Search items...")).toBeTruthy();
  });

  it("sets aria-invalid and accessibilityHint when error is provided", () => {
    const { getByLabelText, getByText } = renderWithTheme(
      <Input label="Email" error="Invalid email address" />
    );

    const input = getByLabelText("Email");
    expect(input.props["aria-invalid"]).toBe(true);
    expect(input.props.accessibilityHint).toBe("Error: Invalid email address");

    const errorAlert = getByText("Invalid email address");
    expect(errorAlert.props.accessibilityRole).toBe("alert");
    expect(errorAlert.props.accessibilityLiveRegion).toBe("assertive");
  });

  it("renders right icon button with accessibility props and triggers haptic feedback on press", () => {
    const onRightIconPress = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <Input
        label="Password"
        rightIcon="eye-outline"
        onRightIconPress={onRightIconPress}
      />
    );

    const actionButton = getByLabelText("eye-outline action");
    expect(actionButton).toBeTruthy();
    expect(actionButton.props.accessibilityRole).toBe("button");

    fireEvent.press(actionButton);
    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(onRightIconPress).toHaveBeenCalledTimes(1);
  });
});
