import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ModernButton } from "../ModernButton";

// Mock theme context
jest.mock("../../../context/ThemeContext", () => ({
  useThemeContextSafe: () => ({
    theme: {
      gradients: {
        primary: ["#000", "#fff"],
      },
    },
  }),
}));

describe("ModernButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with title", () => {
    const { getByText } = render(
      <ModernButton title="Test Button" onPress={() => {}} />
    );
    expect(getByText("Test Button")).toBeTruthy();
  });

  it("calls onPress when pressed", () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <ModernButton title="Press Me" onPress={onPress} />
    );

    fireEvent.press(getByRole("button"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress when disabled", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <ModernButton title="Disabled" onPress={onPress} disabled={true} />
    );

    fireEvent.press(getByText("Disabled"));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("does not call onPress when loading", () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <ModernButton title="Loading" onPress={onPress} loading={true} />
    );

    fireEvent.press(getByRole("button"));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("uses provided accessibilityLabel when loading is true", () => {
    const { getByLabelText } = render(
      <ModernButton
        title="Submit"
        onPress={() => {}}
        loading={true}
        accessibilityLabel="Submit Form"
      />
    );

    expect(getByLabelText("Submit Form")).toBeTruthy();
  });

  it("uses title as accessibilityLabel if not provided", () => {
    const { getByLabelText } = render(
      <ModernButton title="Save" onPress={() => {}} loading={true} />
    );

    expect(getByLabelText("Save")).toBeTruthy();
  });

  it("uses standard accessibilityLabel when not loading", () => {
    const { getByLabelText } = render(
      <ModernButton
        title="Submit"
        onPress={() => {}}
        loading={false}
        accessibilityLabel="Submit Form"
      />
    );

    expect(getByLabelText("Submit Form")).toBeTruthy();
  });
});
