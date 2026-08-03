import React from "react";
import { render } from "@testing-library/react-native";
import { Badge } from "../Badge";

describe("Badge", () => {
  it("renders correctly with label", () => {
    const { getByText } = render(<Badge label="5" />);
    expect(getByText("5")).toBeTruthy();
  });

  it("has correct accessibility attributes", () => {
    const { getByLabelText } = render(<Badge label="5" />);
    const badge = getByLabelText("Badge: 5");

    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe("text");
  });

  it("has correct accessibility attributes in dot mode", () => {
    const { getByLabelText } = render(<Badge label="New" dot={true} />);
    const badge = getByLabelText("Badge: New");

    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe("text");
  });

  it("falls back to default label when accessibilityLabel is empty string", () => {
    const { getByLabelText } = render(<Badge label="5" accessibilityLabel="" />);
    const badge = getByLabelText("Badge: 5");

    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityLabel).toBe("Badge: 5");
  });

  it("uses custom accessibilityLabel when provided", () => {
    const { getByLabelText } = render(<Badge label="5" accessibilityLabel="Custom label" />);
    const badge = getByLabelText("Custom label");

    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityLabel).toBe("Custom label");
  });

  it("handles numeric zero label correctly", () => {
    const { getByText, getByLabelText } = render(<Badge label={0} />);

    expect(getByText("0")).toBeTruthy();
    const badge = getByLabelText("Badge: 0");
    expect(badge.props.accessibilityLabel).toBe("Badge: 0");
  });
});
