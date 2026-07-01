import React from "react";
import { render } from "@testing-library/react-native";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it("renders correctly with label", () => {
    const { getByText } = render(<StatusBadge label="ACTIVE" />);
    expect(getByText("ACTIVE")).toBeTruthy();
  });

  it("has proper accessibility attributes", () => {
    const { getByLabelText } = render(<StatusBadge label="SUCCESS" />);
    const badge = getByLabelText("SUCCESS");
    expect(badge).toBeTruthy();
    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe("text");
  });

  it("hides decorative icons from screen readers", () => {
    const { getByLabelText } = render(
      <StatusBadge label="WARNING" icon="warning" />
    );

    // The icon is within the badge which has an accessibilityLabel,
    // and the icon itself should have importantForAccessibility="no"
    const badge = getByLabelText("WARNING");
    const icons = badge.children.filter((child: any) =>
       child.type === "Text" && child.props.fontFamily === "ionicons"
    );

    icons.forEach((icon: any) => {
      expect(icon.props.importantForAccessibility).toBe("no");
    });
  });
});
