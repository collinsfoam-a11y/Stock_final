import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ModernButton } from "../ModernButton";
import { haptics } from "@/services/haptics";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

// Mock useUiTokens — ModernButton was migrated from useThemeContextSafe to
// useUiTokens (commit 15514d13), so the old ThemeContext mock no longer drives
// the component. Provide the full token surface ModernButton reads.
jest.mock("../../../hooks/useUiTokens", () => ({
  useUiTokens: () => ({
    mode: "light",
    colors: {
      accent: "#2563eb",
      border: "#d1d5db",
      error: "#dc2626",
      surfaceElevated: "#f9fafb",
      textPrimary: "#111827",
      textSecondary: "#4b5563",
    },
    gradients: {
      primary: ["#000", "#fff"],
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

  it("triggers haptics on press in", () => {
    const { getByRole } = render(
      <ModernButton title="Haptic Test" onPress={() => {}} />
    );

    fireEvent(getByRole("button"), "pressIn");

    expect(haptics.light).toHaveBeenCalled();
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

  it("uses provided accessibilityLabel with 'Loading, ' prefix when loading is true", () => {
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

  it("uses title with 'Loading, ' prefix as accessibilityLabel if not provided when loading", () => {
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
