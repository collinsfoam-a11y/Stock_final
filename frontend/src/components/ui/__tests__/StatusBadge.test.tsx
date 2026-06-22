import React from "react";
import { render } from "@testing-library/react-native";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it("renders with correct accessibility label", () => {
    const { getByLabelText, getByText } = render(
      <StatusBadge label="In Progress" variant="neutral" />
    );
    expect(getByText("In Progress")).toBeTruthy();
    const badge = getByLabelText("neutral status: In Progress");
    expect(badge.props.accessible).toBe(true);
  });

  it("applies accessibility hidden to icon", () => {
    const { getByLabelText } = render(
      <StatusBadge label="Alert" variant="error" icon="alert-circle" />
    );
    const badge = getByLabelText("error status: Alert");
    // Find the icon by checking children of the badge
    // Since it's a View with accessible={true}, we might need to look into its children
    // In some environments, getByTestId doesn't work well with nested components in accessible containers
    const icon = badge.children.find((c: any) => c.props?.testID === "status-badge-icon");
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no");
  });
});
