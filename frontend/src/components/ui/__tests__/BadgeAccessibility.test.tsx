import React from "react";
import { render } from "@testing-library/react-native";
import { Badge } from "../Badge";

describe("Badge Accessibility", () => {
  it("should have correct accessibility attributes", () => {
    const { getByLabelText } = render(<Badge label="New" />);
    const badge = getByLabelText("New");

    expect(badge.props.accessible).toBe(true);
  });

  it("should support custom accessibilityLabel", () => {
    const { getByLabelText } = render(<Badge label={5} accessibilityLabel="5 unread messages" />);
    expect(getByLabelText("5 unread messages")).toBeTruthy();
  });
});
