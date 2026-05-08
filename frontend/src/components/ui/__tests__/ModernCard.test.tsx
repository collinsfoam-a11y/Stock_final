import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { ModernCard } from "../ModernCard";
import { haptics } from "../../../services/haptics";

// Mock haptics service
jest.mock("../../../services/haptics", () => ({
  haptics: {
    light: jest.fn().mockResolvedValue(undefined),
    medium: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock theme context
jest.mock("../../../context/ThemeContext", () => ({
  useThemeContextSafe: () => ({
    theme: {
      spacing: { md: 16 },
      borderRadius: { md: 8 },
      gradients: {
        surface: ["#000", "#fff"],
      },
    },
  }),
}));

describe("ModernCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with children", () => {
    const { getByText } = render(
      <ModernCard>
        <Text>Card Content</Text>
      </ModernCard>
    );
    expect(getByText("Card Content")).toBeTruthy();
  });

  it("renders title and subtitle", () => {
    const { getByText } = render(
      <ModernCard title="Test Title" subtitle="Test Subtitle">
        <Text>Content</Text>
      </ModernCard>
    );
    expect(getByText("Test Title")).toBeTruthy();
    expect(getByText("Test Subtitle")).toBeTruthy();
  });

  it("calls onPress and passes event when pressed", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <ModernCard onPress={onPress}>
        <Text>Press Me</Text>
      </ModernCard>
    );

    const event = { nativeEvent: {} };
    fireEvent.press(getByText("Press Me"), event);

    expect(onPress).toHaveBeenCalledWith(expect.objectContaining(event));
  });

  it("triggers haptic light feedback on handlePressIn (when onPress is provided)", () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <ModernCard onPress={onPress}>
        <Text>Press Me</Text>
      </ModernCard>
    );

    // Testing handlePressIn is tricky with fireEvent.press which does the whole sequence
    // But we can check if haptics.light was called during the press event
    fireEvent(getByRole("button"), "pressIn");
    expect(haptics.light).toHaveBeenCalled();
  });

  it("calls onLongPress and triggers medium haptic feedback", () => {
    const onLongPress = jest.fn();
    const { getByText } = render(
      <ModernCard onLongPress={onLongPress}>
        <Text>Long Press Me</Text>
      </ModernCard>
    );

    const event = { nativeEvent: {} };
    fireEvent(getByText("Long Press Me"), "longPress", event);

    expect(onLongPress).toHaveBeenCalledWith(expect.objectContaining(event));
    expect(haptics.medium).toHaveBeenCalled();
  });

  it("does not trigger haptics if no onPress is provided", () => {
    const { getByText } = render(
      <ModernCard>
        <Text>No Action</Text>
      </ModernCard>
    );

    fireEvent(getByText("No Action"), "pressIn");
    expect(haptics.light).not.toHaveBeenCalled();
  });
});
