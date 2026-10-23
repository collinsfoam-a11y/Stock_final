import React from "react";
import { render } from "@testing-library/react-native";
import { LiveIndicator } from "../LiveIndicator";

describe("LiveIndicator", () => {
  it("renders correctly with default label", () => {
    const { getByText } = render(<LiveIndicator />);
    expect(getByText("Live")).toBeTruthy();
  });

  it("renders correctly with custom label", () => {
    const { getByText } = render(<LiveIndicator label="Real-time stream" />);
    expect(getByText("Real-time stream")).toBeTruthy();
  });

  it("has correct accessibility attributes by default", () => {
    const { getByLabelText } = render(<LiveIndicator label="Active" />);
    const indicator = getByLabelText("Status: Active");

    expect(indicator.props.accessible).toBe(true);
    expect(indicator.props.accessibilityRole).toBe("text");
  });

  it("supports custom accessibilityLabel and accessibilityHint", () => {
    const { getByLabelText } = render(
      <LiveIndicator
        label="Online"
        accessibilityLabel="Custom Online Status"
        accessibilityHint="Indicates active server connection"
      />
    );
    const indicator = getByLabelText("Custom Online Status");

    expect(indicator.props.accessible).toBe(true);
    expect(indicator.props.accessibilityRole).toBe("text");
    expect(indicator.props.accessibilityHint).toBe("Indicates active server connection");
  });
});
