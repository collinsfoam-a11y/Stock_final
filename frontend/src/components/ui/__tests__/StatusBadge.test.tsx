import React from "react";
import { render } from "@testing-library/react-native";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it("renders correctly with label", () => {
    const { getByText } = render(<StatusBadge label="ACTIVE" />);
    expect(getByText("ACTIVE")).toBeTruthy();
  });

  it("applies correct accessibility attributes", () => {
    const { getByLabelText } = render(<StatusBadge label="COMPLETED" variant="success" />);
    const badge = getByLabelText("COMPLETED");

    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe("text");
    expect(badge.props.accessibilityLabel).toBe("COMPLETED");
  });

  it("hides decorative icon from accessibility tree", () => {
    const { UNSAFE_getByType } = render(<StatusBadge label="SYNCING" icon="sync" />);

    const icon = UNSAFE_getByType("Ionicons");
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no");
    expect(icon.props["aria-hidden"]).toBe(true);
  });
});
