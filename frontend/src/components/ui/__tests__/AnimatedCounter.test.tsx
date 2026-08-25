import React from "react";
import { render } from "@testing-library/react-native";
import { AnimatedCounter } from "../AnimatedCounter";

describe("AnimatedCounter", () => {
  it("renders correctly with default props", () => {
    const { getByText } = render(<AnimatedCounter value={100} duration={0} />);
    expect(getByText("100")).toBeTruthy();
  });

  it("applies correct accessibility attributes with computed label", () => {
    const { getByLabelText } = render(
      <AnimatedCounter value={1250} prefix="$" suffix=" USD" duration={0} />
    );
    const element = getByLabelText("$1,250 USD");
    expect(element).toBeTruthy();
    expect(element.props.accessible).toBe(true);
    expect(element.props.accessibilityRole).toBe("text");
  });

  it("uses custom accessibilityLabel when provided", () => {
    const { getByLabelText } = render(
      <AnimatedCounter
        value={50}
        prefix="$"
        accessibilityLabel="Total revenue: 50 dollars"
        duration={0}
      />
    );
    expect(getByLabelText("Total revenue: 50 dollars")).toBeTruthy();
  });

  it("handles decimalPlaces formatting in accessibilityLabel when formatNumber is false", () => {
    const { getByLabelText } = render(
      <AnimatedCounter
        value={12.3456}
        decimalPlaces={2}
        formatNumber={false}
        duration={0}
      />
    );
    expect(getByLabelText("12.35")).toBeTruthy();
  });
});
