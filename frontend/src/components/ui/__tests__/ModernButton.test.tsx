import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ModernButton } from "../ModernButton";
import { haptics } from "../../../services/haptics";

// Mock haptics service
jest.mock("../../../services/haptics", () => ({
  haptics: {
    light: jest.fn().mockResolvedValue(undefined),
  },
}));

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

  it("calls onPress and triggers haptic feedback when pressed", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <ModernButton title="Press Me" onPress={onPress} />
    );

    const event = { nativeEvent: {} };
    fireEvent.press(getByText("Press Me"), event);

    expect(onPress).toHaveBeenCalledWith(expect.objectContaining(event));
    expect(haptics.light).toHaveBeenCalled();
  });

  it("does not call onPress or trigger haptic when disabled", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <ModernButton title="Disabled" onPress={onPress} disabled={true} />
    );

    fireEvent.press(getByText("Disabled"));

    expect(onPress).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
  });

  it("does not call onPress or trigger haptic when loading", () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <ModernButton title="Loading" onPress={onPress} loading={true} />
    );

    fireEvent.press(getByRole("button"));

    expect(onPress).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
  });

  it("prepends 'Loading, ' to accessibilityLabel when loading is true", () => {
    const { getByLabelText } = render(
      <ModernButton
        title="Submit"
        onPress={() => {}}
        loading={true}
        accessibilityLabel="Submit Form"
      />
    );

    expect(getByLabelText("Loading, Submit Form")).toBeTruthy();
  });

  it("uses title as base for accessibilityLabel if not provided", () => {
    const { getByLabelText } = render(
      <ModernButton title="Save" onPress={() => {}} loading={true} />
    );

    expect(getByLabelText("Loading, Save")).toBeTruthy();
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
