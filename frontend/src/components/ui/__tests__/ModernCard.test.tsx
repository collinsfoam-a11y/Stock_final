import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { ModernCard } from "../ModernCard";
import { haptics } from "@/services/haptics";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

// Mock theme context
jest.mock("../../../context/ThemeContext", () => ({
  useThemeContextSafe: () => ({
    theme: {
      spacing: {
        md: 16,
      },
      gradients: {
        surface: ["#000", "#fff"],
      },
    },
    themeLegacy: {
      colors: {
        card: "#fff",
        border: "#eee",
        textPrimary: "#000",
        textSecondary: "#666",
        accent: "#3B82F6",
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
      <ModernCard title="Card Title" subtitle="Card Subtitle">
        <Text>Content</Text>
      </ModernCard>
    );
    expect(getByText("Card Title")).toBeTruthy();
    expect(getByText("Card Subtitle")).toBeTruthy();
  });

  it("calls onPress when pressed", () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <ModernCard onPress={onPress} title="Pressable Card">
        <Text>Content</Text>
      </ModernCard>
    );

    fireEvent.press(getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("triggers haptics on press in", () => {
    const { getByRole } = render(
      <ModernCard onPress={() => {}} title="Haptic Card">
        <Text>Content</Text>
      </ModernCard>
    );

    fireEvent(getByRole("button"), "pressIn");
    expect(haptics.light).toHaveBeenCalled();
  });

  it("sets accessibility role to button when onPress is provided", () => {
    const { getByRole } = render(
      <ModernCard onPress={() => {}} title="Button Card">
        <Text>Content</Text>
      </ModernCard>
    );
    expect(getByRole("button")).toBeTruthy();
  });
});
