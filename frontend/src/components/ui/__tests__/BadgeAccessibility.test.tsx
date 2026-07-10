import React from "react";
import { render } from "@testing-library/react-native";
import { Badge } from "../Badge";

describe("Badge Accessibility", () => {
  it("has correct accessibility props for text variant", () => {
    const { getByLabelText } = render(<Badge label="New" />);
    const badge = getByLabelText("Badge: New");
    expect(badge.props.accessibilityRole).toBe("text");
    expect(badge.props.accessible).toBe(true);
  });

  it("has correct accessibility props for dot variant", () => {
    const { getByLabelText } = render(<Badge label="1" dot />);
    const dot = getByLabelText("Notification dot");
    expect(dot.props.accessibilityRole).toBe("text");
    expect(dot.props.accessible).toBe(true);
  });
});
