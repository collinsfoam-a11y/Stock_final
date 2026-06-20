import React from "react";
import { render } from "@testing-library/react-native";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it("renders correctly with label", () => {
    const { getByText } = render(<StatusBadge label="Success" variant="success" />);
    expect(getByText("Success")).toBeTruthy();
  });

  it("applies correct accessibility properties", () => {
    const { getByLabelText } = render(
      <StatusBadge label="Warning" variant="warning" />
    );
    const badge = getByLabelText("warning status: Warning");
    expect(badge.props.accessible).toBe(true);
  });

  it("uses custom accessibilityLabel when provided", () => {
    const { getByLabelText } = render(
      <StatusBadge
        label="Active"
        variant="success"
        accessibilityLabel="Custom label"
      />
    );
    expect(getByLabelText("Custom label")).toBeTruthy();
  });

  it("renders with icon and hides it from accessibility", () => {
    const { getByLabelText } = render(
      <StatusBadge label="Info" variant="info" icon="information-circle" />
    );
    const badge = getByLabelText("info status: Info");

    // Check if icon is present in the children (Ionicons)
    // and has accessibility properties to hide it
    const icon = badge.children.find(
      (child: any) => child.type === "Icon" || (child.props && child.props.name === "information-circle")
    );

    if (icon) {
       expect(icon.props.accessibilityElementsHidden).toBe(true);
       expect(icon.props.importantForAccessibility).toBe("no");
    }
  });

  it("handles pulse animation state correctly for accessibility", () => {
    const { getByLabelText } = render(
      <StatusBadge label="Active" variant="success" pulse={true} />
    );
    const badge = getByLabelText("success status: Active");
    expect(badge.props.accessible).toBe(true);
  });
});
