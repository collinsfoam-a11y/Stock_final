import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { StatsCard } from "../StatsCard";
import * as Haptics from "expo-haptics";

describe("StatsCard", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with basic title and value", () => {
    const { getByText } = render(
      <StatsCard title="Completed Recounts" value={42} icon="checkmark-circle" />
    );

    expect(getByText("Completed Recounts")).toBeTruthy();
    expect(getByText("42")).toBeTruthy();
  });

  it("handles prefix, suffix, and subtitle correctly", () => {
    const { getByText } = render(
      <StatsCard
        title="Revenue"
        value={1500}
        prefix="$"
        suffix=" USD"
        subtitle="Last 30 Days"
        icon="cash"
      />
    );

    expect(getByText("$1500 USD")).toBeTruthy();
    expect(getByText("Last 30 Days")).toBeTruthy();
  });

  it("renders trend percentage correctly when provided", () => {
    const { getByText } = render(
      <StatsCard
        title="Active Sessions"
        value={10}
        icon="people"
        trend={{ value: 15, isPositive: true }}
      />
    );

    expect(getByText("15%")).toBeTruthy();
  });

  it("has proper accessibility attributes for non-interactive state", () => {
    const { getByLabelText } = render(
      <StatsCard
        title="Accuracy Rate"
        value={98.5}
        suffix="%"
        subtitle="All warehouses"
        icon="analytics"
        trend={{ value: 2.1, isPositive: true }}
      />
    );

    // Dynamic accessibility label: "<title>, Value: <valueStr>, <subtitle>, Trend: <trendDirection> by <trendValue>%"
    const card = getByLabelText(
      "Accuracy Rate, Value: 98.5%, All warehouses, Trend: up by 2.1%"
    );

    expect(card.props.accessible).toBe(true);
    expect(card.props.accessibilityRole).toBe("none");
  });

  it("has proper accessibility attributes for interactive state (onPress provided)", () => {
    const mockOnPress = jest.fn();
    const { getByLabelText } = render(
      <StatsCard
        title="Accuracy Rate"
        value={98.5}
        suffix="%"
        subtitle="All warehouses"
        icon="analytics"
        trend={{ value: 1.5, isPositive: false }}
        onPress={mockOnPress}
      />
    );

    const pressable = getByLabelText(
      "Accuracy Rate, Value: 98.5%, All warehouses, Trend: down by 1.5%"
    );

    expect(pressable.props.accessible).toBe(true);
    expect(pressable.props.accessibilityRole).toBe("button");

    fireEvent(pressable, "pressIn");
    fireEvent.press(pressable);

    expect(mockOnPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith("light");
  });

  it("hides decorative icons from screen readers", () => {
    const { UNSAFE_queryAllByType } = render(
      <StatsCard
        title="Pending Items"
        value={7}
        icon="alert-circle"
        trend={{ value: 5, isPositive: false }}
      />
    );

    const icons = UNSAFE_queryAllByType("Ionicons" as any);
    expect(icons.length).toBeGreaterThan(0);

    icons.forEach((icon) => {
      expect(icon.props.accessibilityElementsHidden).toBe(true);
      expect(icon.props.importantForAccessibility).toBe("no");
      expect(icon.props["aria-hidden"]).toBe(true);
    });
  });
});
