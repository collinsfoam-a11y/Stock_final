import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { QuickStatCard } from "../QuickStatCard";
import { haptics } from "@/services/haptics";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("QuickStatCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with title and value", () => {
    const { getByText } = render(
      <QuickStatCard title="Active Sessions" value={42} />
    );
    expect(getByText("Active Sessions")).toBeTruthy();
    expect(getByText("42")).toBeTruthy();
  });

  it("triggers haptics and has correct accessibility label when interactive", () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <QuickStatCard
        title="Revenue"
        value="1,200"
        prefix="$"
        onPress={onPress}
        testID="stat-card"
      />
    );

    const button = getByTestId("stat-card");
    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityLabel).toBe("Revenue: $1,200");

    fireEvent(button, "pressIn");
    expect(haptics.light).toHaveBeenCalled();
  });

  it("does not have button role or trigger haptics when not interactive", () => {
    const { getByTestId } = render(
      <QuickStatCard
        title="Revenue"
        value="1,200"
        prefix="$"
        testID="stat-card"
      />
    );

    const card = getByTestId("stat-card");
    // When not interactive, it should NOT have accessibilityRole="button"
    expect(card.props.accessibilityRole).toBeUndefined();

    // It might not even have a pressIn event if it's a View
    try {
        fireEvent(card, "pressIn");
    } catch (e) {}

    expect(haptics.light).not.toHaveBeenCalled();
  });

  it("hides icons from accessibility", () => {
    const trend = { direction: "up" as const, value: "10%" };
    const { UNSAFE_getAllByProps } = render(
      <QuickStatCard
        title="Stats"
        value={100}
        icon="star"
        trend={trend}
      />
    );

    const hiddenIcons = UNSAFE_getAllByProps({ name: "star" });
    expect(hiddenIcons[0].props.accessibilityElementsHidden).toBe(true);

    const hiddenTrendIcons = UNSAFE_getAllByProps({ name: "trending-up" });
    expect(hiddenTrendIcons[0].props.accessibilityElementsHidden).toBe(true);
  });
});
