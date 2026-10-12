import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { StatsCard } from "../StatsCard";

describe("StatsCard", () => {
  it("renders non-interactive card with narrative accessibility summary", () => {
    const { getByLabelText, getByText } = render(
      <StatsCard
        title="Total Items"
        value={150}
        icon="cube"
        subtitle="Across 3 zones"
        trend={{ value: 12, isPositive: true }}
      />
    );

    expect(getByText("Total Items")).toBeTruthy();
    expect(getByText("150")).toBeTruthy();

    const accessibleCard = getByLabelText("Total Items: 150. Across 3 zones. Trend: up 12%");
    expect(accessibleCard.props.accessible).toBe(true);
    expect(accessibleCard.props.accessibilityRole).toBe("text");
  });

  it("supports custom accessibilityLabel and prefix/suffix formatting", () => {
    const { getByLabelText } = render(
      <StatsCard
        title="Accuracy Rate"
        value="98.5"
        suffix="%"
        icon="analytics"
        accessibilityLabel="Custom accuracy summary"
      />
    );

    const accessibleCard = getByLabelText("Custom accuracy summary");
    expect(accessibleCard.props.accessible).toBe(true);
  });

  it("handles interactive mode with onPress handler and button accessibility role", () => {
    const onPressMock = jest.fn();
    const { getByRole } = render(
      <StatsCard
        title="Pending Approvals"
        value={5}
        icon="time"
        onPress={onPressMock}
        accessibilityHint="Tap to view approval queue"
      />
    );

    const button = getByRole("button");
    expect(button.props.accessibilityLabel).toBe("Pending Approvals: 5");
    expect(button.props.accessibilityHint).toBe("Tap to view approval queue");

    fireEvent.press(button);
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });
});
