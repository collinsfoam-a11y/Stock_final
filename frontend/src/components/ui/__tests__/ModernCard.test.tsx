import React from "react";
import { Text, View } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { ModernCard } from "../ModernCard";
import { haptics } from "@/services/haptics";

// Mock haptics
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

// Mock theme context
jest.mock("../../../context/ThemeContext", () => ({
  useThemeContextSafe: () => ({
    theme: {
      spacing: { md: 16 },
      gradients: { surface: ["#000", "#fff"] },
    },
    themeLegacy: {
      colors: {
        card: "#fff",
        border: "#ccc",
        textPrimary: "#000",
        textSecondary: "#666",
        accent: "#00f",
      },
    },
  }),
}));

describe("ModernCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with title and icon", () => {
    const { getByText, UNSAFE_getAllByType } = render(
      <ModernCard title="Test Card" icon="home">
        <Text>Card Content</Text>
      </ModernCard>
    );

    expect(getByText("Test Card")).toBeTruthy();
    expect(getByText("Card Content")).toBeTruthy();

    // Verify icon container has decorative icon props
    const allViews = UNSAFE_getAllByType(View);
    const iconContainer = allViews.find(v => v.props.accessibilityElementsHidden === true);
    expect(iconContainer).toBeTruthy();
    expect(iconContainer.props.importantForAccessibility).toBe("no");
    expect(iconContainer.props["aria-hidden"]).toBe(true);
  });

  it("triggers haptics.light on press", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <ModernCard title="Pressable Card" onPress={onPress}>
        <Text>Content</Text>
      </ModernCard>
    );

    // ModernCard title text is inside the card which is the pressable
    fireEvent(getByText("Pressable Card"), "pressIn");
    expect(haptics.light).toHaveBeenCalled();
  });

  it("applies correct accessibility role when pressable", () => {
    const { getByLabelText } = render(
      <ModernCard title="Accessible Card" onPress={() => {}} accessibilityLabel="Card Label">
        <Text>Content</Text>
      </ModernCard>
    );

    const card = getByLabelText("Card Label");
    expect(card.props.accessibilityRole).toBe("button");
  });

  it("does not apply button role when not pressable", () => {
    const { getByText } = render(
      <ModernCard title="Static Card">
        <Text>Content</Text>
      </ModernCard>
    );

    // Find the view that represents the card
    const cardTitle = getByText("Static Card");

    const findCardContainer = (node: any): any => {
      if (!node) return null;
      if (node.props.testID === "modern-card") return node;
      // If no testID, check for specific role
      if (node.props.accessibilityRole === "none") return node;
      return findCardContainer(node.parent);
    };

    // Re-rendering with testID for easier selection
    const { getByTestId } = render(
      <ModernCard title="Static Card" testID="modern-card">
        <Text>Content</Text>
      </ModernCard>
    );

    const card = getByTestId("modern-card");
    expect(card.props.accessibilityRole).toBe("none");
  });
});
