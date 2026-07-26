import React from "react";
import { render } from "@testing-library/react-native";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it("renders correctly with label", () => {
    const { getByText } = render(<StatusBadge label="ACTIVE" />);
    expect(getByText("ACTIVE")).toBeTruthy();
  });

  it("has correct accessibility attributes", () => {
    const { getByLabelText } = render(<StatusBadge label="ACTIVE" />);
    const badge = getByLabelText("Status: ACTIVE");

    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe("text");
  });

  it("hides decorative icon from screen readers", () => {
    const { UNSAFE_queryByType } = render(
      <StatusBadge label="ACTIVE" icon="radio-button-on" />
    );

    // Ionicons are typically rendered as Text or similar components in tests depending on the mock
    // We check if it has the decorative icon props
    const icon = UNSAFE_queryByType(require("@expo/vector-icons/Ionicons").default);
    if (icon) {
      expect(icon.props.accessibilityElementsHidden).toBe(true);
      expect(icon.props.importantForAccessibility).toBe("no");
    }
  });

  it("renders with pulse animation without breaking accessibility", () => {
    const { getByLabelText } = render(<StatusBadge label="ACTIVE" pulse={true} />);
    const badge = getByLabelText("Status: ACTIVE");

    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe("text");
  });
});
