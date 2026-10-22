import React from "react";
import { render } from "@testing-library/react-native";
import { AnimatedCounter } from "../AnimatedCounter";

describe("AnimatedCounter", () => {
  it("renders with correct accessibility attributes and default formatted value", () => {
    const { getByRole } = render(
      <AnimatedCounter value={1250} prefix="$" suffix=" USD" formatNumber={true} duration={0} />
    );

    const counter = getByRole("text");
    expect(counter.props.accessible).toBe(true);
    expect(counter.props.accessibilityLabel).toBe("$1,250 USD");
  });

  it("supports custom accessibilityLabel and accessibilityHint props", () => {
    const { getByRole } = render(
      <AnimatedCounter
        value={99}
        prefix="#"
        duration={0}
        accessibilityLabel="Total items counted: 99"
        accessibilityHint="Updates automatically"
      />
    );

    const counter = getByRole("text");
    expect(counter.props.accessibilityLabel).toBe("Total items counted: 99");
    expect(counter.props.accessibilityHint).toBe("Updates automatically");
  });
});
