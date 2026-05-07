import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { ModernCard } from "../ModernCard";
import { haptics } from "../../../services/haptics";

// Mock haptics service
jest.mock("../../../services/haptics", () => ({
  haptics: {
    light: jest.fn().mockResolvedValue(undefined),
    medium: jest.fn().mockResolvedValue(undefined),
    isAvailable: jest.fn().mockReturnValue(true),
  },
}));

// Mock theme context
jest.mock("../../../context/ThemeContext", () => ({
  useThemeContextSafe: jest.fn().mockReturnValue({
    theme: {
      spacing: { md: 12 },
      borderRadius: { md: 12 },
    },
  }),
}));

describe("ModernCard", () => {
  it("renders children correctly", () => {
    const { getByText } = render(
      <ModernCard>
        <Text>Card Content</Text>
      </ModernCard>
    );
    expect(getByText("Card Content")).toBeTruthy();
  });

  it("triggers haptics.light when pressed", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <ModernCard onPress={onPress}>
        <Text>Press Me</Text>
      </ModernCard>
    );

    fireEvent.press(getByText("Press Me"));
    expect(onPress).toHaveBeenCalled();
    expect(haptics.light).toHaveBeenCalled();
  });

  it("triggers haptics.medium when long pressed", () => {
    const onLongPress = jest.fn();
    const { getByText } = render(
      <ModernCard onLongPress={onLongPress}>
        <Text>Long Press Me</Text>
      </ModernCard>
    );

    fireEvent(getByText("Long Press Me"), "longPress");
    expect(onLongPress).toHaveBeenCalled();
    expect(haptics.medium).toHaveBeenCalled();
  });

  it("is interactive and has button role when only onLongPress is provided", () => {
    const { getByRole } = render(
      <ModernCard onLongPress={() => {}}>
        <Text>Interactive Card</Text>
      </ModernCard>
    );

    const card = getByRole("button");
    expect(card).toBeTruthy();
  });

  it("is not interactive and has no button role when no handlers provided", () => {
    const { queryByRole } = render(
      <ModernCard>
        <Text>Static Card</Text>
      </ModernCard>
    );

    expect(queryByRole("button")).toBeNull();
  });
});
