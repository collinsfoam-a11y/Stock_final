import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ModernButton } from "../ModernButton";
import { haptics } from "../../../services/haptics";

jest.mock("../../../services/haptics", () => ({
  haptics: {
    light: jest.fn().mockResolvedValue(undefined),
    isAvailable: jest.fn().mockReturnValue(true),
  },
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
    const { getByText } = render(
      <ModernButton title="Press Me" onPress={onPress} />
    );

    fireEvent.press(getByText("Press Me"));
    expect(onPress).toHaveBeenCalled();
  });

  it("triggers haptic feedback on press", () => {
    const { getByText } = render(
      <ModernButton title="Haptic" onPress={() => {}} />
    );

    fireEvent(getByText("Haptic"), "pressIn");
    expect(haptics.light).toHaveBeenCalled();
  });

  it("updates accessibilityLabel when loading", () => {
    const { getByRole } = render(
      <ModernButton title="Action" onPress={() => {}} loading={true} />
    );

    const button = getByRole("button");
    expect(button.props.accessibilityLabel).toBe("Loading, Action");
  });

  it("uses custom accessibilityLabel when provided", () => {
    const { getByRole } = render(
      <ModernButton
        title="Action"
        onPress={() => {}}
        accessibilityLabel="Custom Label"
      />
    );

    const button = getByRole("button");
    expect(button.props.accessibilityLabel).toBe("Custom Label");
  });

  it("prepends Loading to custom accessibilityLabel when loading", () => {
    const { getByRole } = render(
      <ModernButton
        title="Action"
        onPress={() => {}}
        loading={true}
        accessibilityLabel="Custom Label"
      />
    );

    const button = getByRole("button");
    expect(button.props.accessibilityLabel).toBe("Loading, Custom Label");
  });

  it("does not trigger haptic when disabled", () => {
    const { getByText } = render(
      <ModernButton title="Disabled" onPress={() => {}} disabled={true} />
    );

    fireEvent(getByText("Disabled"), "pressIn");
    expect(haptics.light).not.toHaveBeenCalled();
  });
});
