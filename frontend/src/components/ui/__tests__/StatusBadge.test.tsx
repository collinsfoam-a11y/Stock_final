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

  it("supports custom accessibilityLabel and accessibilityHint", () => {
    const { getByLabelText } = render(
      <StatusBadge
        label="ACTIVE"
        accessibilityLabel="Device is active"
        accessibilityHint="Indicates real-time scanner connectivity"
      />
    );
    const badge = getByLabelText("Device is active");

    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe("text");
    expect(badge.props.accessibilityHint).toBe("Indicates real-time scanner connectivity");
  });

  it("handles empty or whitespace label gracefully in accessibilityLabel", () => {
    const { getByLabelText } = render(<StatusBadge label="" />);
    const badge = getByLabelText("Status");

    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe("text");
  });

  it("hides decorative icon from screen readers", () => {
    const { UNSAFE_queryByType } = render(
      <StatusBadge label="ACTIVE" icon="radio-button-on" />
    );

    const icon = UNSAFE_queryByType(require("@expo/vector-icons/Ionicons").default);
    if (icon) {
      expect(icon.props.accessibilityElementsHidden).toBe(true);
      expect(icon.props.importantForAccessibility).toBe("no");
    }
  });

  it("renders with pulse animation without breaking accessibility", () => {
    const { getByLabelText } = render(
      <StatusBadge
        label="ACTIVE"
        pulse={true}
        accessibilityLabel="Sync in progress"
        accessibilityHint="Currently syncing records"
      />
    );
    const badge = getByLabelText("Sync in progress");

    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe("text");
    expect(badge.props.accessibilityHint).toBe("Currently syncing records");
  });
});
