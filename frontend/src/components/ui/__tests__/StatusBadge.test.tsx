import React from "react";
import { render } from "@testing-library/react-native";
import { StatusBadge } from "../StatusBadge";
import Ionicons from "@expo/vector-icons/Ionicons";

describe("StatusBadge", () => {
  it("renders correctly with custom label", () => {
    const { getByText } = render(<StatusBadge label="ACTIVE" variant="success" />);
    expect(getByText("ACTIVE")).toBeTruthy();
  });

  it("applies standard accessibility properties to non-pulsing container", () => {
    const { getByLabelText } = render(<StatusBadge label="ACTIVE" variant="success" />);
    const badge = getByLabelText("ACTIVE");

    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe("text");
    expect(badge.props.accessibilityLabel).toBe("ACTIVE");
  });

  it("applies standard accessibility properties to pulsing container", () => {
    const { getByLabelText } = render(<StatusBadge label="ACTIVE" variant="success" pulse />);
    const badge = getByLabelText("ACTIVE");

    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe("text");
    expect(badge.props.accessibilityLabel).toBe("ACTIVE");
  });

  it("hides internal decorative icon from screen readers when icon is provided", () => {
    const { UNSAFE_getByType } = render(
      <StatusBadge label="ACTIVE" variant="success" icon="checkmark-circle" />
    );
    const icon = UNSAFE_getByType(Ionicons);

    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no");
    expect(icon.props["aria-hidden"]).toBe(true);
  });
});
