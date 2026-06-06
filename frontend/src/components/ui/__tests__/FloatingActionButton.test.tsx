import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { FloatingActionButton } from "../FloatingActionButton";
import { haptics } from "@/services/haptics";

// Mock haptics
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

// Mock Ionicons to check for decorative props
jest.mock("@expo/vector-icons/Ionicons", () => {
  const { View } = require("react-native");
  return (props: any) => <View {...props} testID="ionicons-icon" />;
});

describe("FloatingActionButton", () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with accessibility role", () => {
    const { getByRole } = render(
      <FloatingActionButton icon="add" onPress={mockOnPress} accessibilityLabel="Add Item" />,
    );
    const button = getByRole("button");
    expect(button).toBeTruthy();
    expect(button.props.accessibilityLabel).toBe("Add Item");
  });

  it("triggers onPress and haptic feedback when pressed", () => {
    const { getByRole } = render(
      <FloatingActionButton icon="add" onPress={mockOnPress} accessibilityLabel="Add Item" />,
    );
    const button = getByRole("button");

    fireEvent.press(button);

    expect(mockOnPress).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it("hides the icon from screen readers", () => {
    const { getByTestId } = render(
      <FloatingActionButton icon="add" onPress={mockOnPress} accessibilityLabel="Add Item" />,
    );

    // Using testID is the most reliable way when elements are hidden from accessibility queries
    // We need to pass { includeHiddenElements: true } to getByTestId if the element is hidden
    const icon = getByTestId("ionicons-icon", { includeHiddenElements: true });
    expect(icon).toBeTruthy();

    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no");
    expect(icon.props["aria-hidden"]).toBe(true);
  });

  it("renders label when in extended variant", () => {
    const { getByText } = render(
      <FloatingActionButton
        icon="add"
        onPress={mockOnPress}
        label="Add Item"
        size="extended"
      />,
    );
    expect(getByText("Add Item")).toBeTruthy();
  });

  it("is disabled when the disabled prop is true", () => {
    const { getByRole } = render(
      <FloatingActionButton
        icon="add"
        onPress={mockOnPress}
        disabled={true}
        accessibilityLabel="Add Item"
      />,
    );
    const button = getByRole("button");
    expect(button.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(button);
    expect(mockOnPress).not.toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
  });
});
