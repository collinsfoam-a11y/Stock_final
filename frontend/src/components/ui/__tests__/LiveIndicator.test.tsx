import React from "react";
import { render } from "@testing-library/react-native";
import { LiveIndicator } from "../LiveIndicator";

describe("LiveIndicator", () => {
  it("renders correctly with default label", () => {
    const { getByText, getByLabelText } = render(<LiveIndicator />);
    expect(getByText("Live")).toBeTruthy();

    const indicator = getByLabelText("Status: Live");
    expect(indicator.props.accessible).toBe(true);
    expect(indicator.props.accessibilityRole).toBe("text");
  });

  it("renders correctly with custom label", () => {
    const { getByText, getByLabelText } = render(<LiveIndicator label="Online" />);
    expect(getByText("Online")).toBeTruthy();

    const indicator = getByLabelText("Status: Online");
    expect(indicator.props.accessible).toBe(true);
    expect(indicator.props.accessibilityRole).toBe("text");
  });

  it("supports custom accessibilityLabel prop", () => {
    const { getByLabelText } = render(
      <LiveIndicator label="Active" accessibilityLabel="System is actively streaming" />
    );

    const indicator = getByLabelText("System is actively streaming");
    expect(indicator.props.accessible).toBe(true);
    expect(indicator.props.accessibilityRole).toBe("text");
  });

  it("handles empty label gracefully with fallback accessibilityLabel", () => {
    const { getByLabelText } = render(<LiveIndicator label="" />);

    const indicator = getByLabelText("Live status indicator");
    expect(indicator.props.accessible).toBe(true);
    expect(indicator.props.accessibilityRole).toBe("text");
  });
});
