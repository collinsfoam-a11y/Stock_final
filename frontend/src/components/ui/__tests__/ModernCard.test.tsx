import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { ModernCard } from "../ModernCard";
import { haptics } from "@/services/haptics";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("ModernCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders children correctly", () => {
    const { getByText } = render(
      <ModernCard>
        <Text>Card Content</Text>
      </ModernCard>
    );
    expect(getByText("Card Content")).toBeTruthy();
  });

  it("triggers haptics on press in when onPress is provided", () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <ModernCard onPress={onPress} testID="modern-card">
        <Text>Content</Text>
      </ModernCard>
    );

    const card = getByTestId("modern-card");
    fireEvent(card, "pressIn");

    expect(haptics.light).toHaveBeenCalled();
  });

  it("does not trigger haptics on press in when onPress is not provided", () => {
    const { getByTestId } = render(
      <ModernCard testID="modern-card">
        <Text>Content</Text>
      </ModernCard>
    );

    const card = getByTestId("modern-card");
    // If onPress is not provided, it might not be a touchable component or might not have pressIn
    try {
      fireEvent(card, "pressIn");
    } catch (e) {
      // Ignore if pressIn is not supported on non-touchable
    }

    expect(haptics.light).not.toHaveBeenCalled();
  });

  it("hides decorative icon from accessibility", () => {
    const { getByTestId } = render(
      <ModernCard icon="star" testID="modern-card">
        <Text>Content</Text>
      </ModernCard>
    );

    const card = getByTestId("modern-card");
    // Find the icon. In React Native, we can check props of children.
    // ModernCard renders icon inside a View.
    const icon = card.findByProps({ name: "star" });
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no");
  });
});
