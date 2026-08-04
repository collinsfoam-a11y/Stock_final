import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { StatsCard } from "../StatsCard";
import { ThemeProvider } from "../../../context/ThemeContext";

describe("StatsCard Component", () => {
  const defaultProps = {
    title: "Total Items",
    value: 1250,
    icon: "cube-outline" as const,
  };

  const renderWithTheme = (ui: React.ReactElement) => {
    return render(<ThemeProvider>{ui}</ThemeProvider>);
  };

  it("renders basic title and value correctly", () => {
    const { getByText } = renderWithTheme(<StatsCard {...defaultProps} />);
    expect(getByText("Total Items")).toBeTruthy();
    expect(getByText("1250")).toBeTruthy();
  });

  it("renders custom prefix and suffix correctly", () => {
    const { getByText } = renderWithTheme(
      <StatsCard {...defaultProps} prefix="$" suffix="k" />
    );
    expect(getByText("$1250k")).toBeTruthy();
  });

  it("renders subtitle correctly", () => {
    const { getByText } = renderWithTheme(
      <StatsCard {...defaultProps} subtitle="In stock" />
    );
    expect(getByText("In stock")).toBeTruthy();
  });

  it("renders trend metric correctly when positive", () => {
    const { getByText } = renderWithTheme(
      <StatsCard {...defaultProps} trend={{ value: 12.5, isPositive: true }} />
    );
    expect(getByText("12.5%")).toBeTruthy();
  });

  it("renders trend metric correctly when negative", () => {
    const { getByText } = renderWithTheme(
      <StatsCard {...defaultProps} trend={{ value: 5.2, isPositive: false }} />
    );
    expect(getByText("5.2%")).toBeTruthy();
  });

  it("compiles the correct accessibility label for screen readers", () => {
    const { getByLabelText } = renderWithTheme(
      <StatsCard
        {...defaultProps}
        subtitle="In stock"
        trend={{ value: 8.4, isPositive: true }}
      />
    );
    const container = getByLabelText("Total Items: 1250, In stock, Up by 8.4%");
    expect(container).toBeTruthy();
  });

  it("uses explicit override accessibilityLabel if provided", () => {
    const { getByLabelText } = renderWithTheme(
      <StatsCard
        {...defaultProps}
        accessibilityLabel="Override Custom Accessibility Label"
      />
    );
    const container = getByLabelText("Override Custom Accessibility Label");
    expect(container).toBeTruthy();
  });

  it("triggers onPress callback and behaves as a button when onPress is provided", () => {
    const onPressMock = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <StatsCard {...defaultProps} onPress={onPressMock} />
    );
    const pressable = getByLabelText("Total Items: 1250");
    expect(pressable.props.accessibilityRole).toBe("button");

    fireEvent.press(pressable);
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });
});
