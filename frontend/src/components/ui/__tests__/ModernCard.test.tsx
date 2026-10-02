import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ModernCard } from "../ModernCard";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("ModernCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with title, subtitle, and children", () => {
    const { getByText } = render(
      <ModernCard title="Test Title" subtitle="Test Subtitle">
        <Text>Card Children</Text>
      </ModernCard>
    );

    expect(getByText("Test Title")).toBeTruthy();
    expect(getByText("Test Subtitle")).toBeTruthy();
    expect(getByText("Card Children")).toBeTruthy();
  });

  it("calls onPress and triggers haptics when pressed", () => {
    const onPressMock = jest.fn();
    const { getByText } = render(
      <ModernCard title="Interactive Card" onPress={onPressMock}>
        <Text>Content</Text>
      </ModernCard>
    );

    const cardTouchable = getByText("Interactive Card");
    fireEvent(cardTouchable, "pressIn");
    expect(haptics.light).toHaveBeenCalledTimes(1);

    fireEvent.press(cardTouchable);
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it("marks header icons as decorative for screen readers", () => {
    const { UNSAFE_getByType } = render(
      <ModernCard title="Card with Icon" icon="star">
        <Text>Content</Text>
      </ModernCard>
    );

    const iconInstance = UNSAFE_getByType(Ionicons);
    expect(iconInstance.props.accessibilityElementsHidden).toBe(true);
    expect(iconInstance.props.importantForAccessibility).toBe("no");
    expect(iconInstance.props["aria-hidden"]).toBe(true);
  });
});
