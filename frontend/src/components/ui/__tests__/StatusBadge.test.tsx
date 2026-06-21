import React from "react";
import { render } from "@testing-library/react-native";
import { StatusBadge } from "../StatusBadge";
import Ionicons from "@expo/vector-icons/Ionicons";

describe("StatusBadge", () => {
  it("renders correctly with label", () => {
    const { getByText } = render(<StatusBadge label="Completed" variant="success" />);
    expect(getByText("Completed")).toBeTruthy();
  });

  it("has correct accessibility attributes by default", () => {
    const { getByLabelText } = render(
      <StatusBadge label="Pending" variant="warning" />
    );
    const badge = getByLabelText("warning status: Pending");

    expect(badge.props.accessible).toBe(true);
  });

  it("uses custom accessibilityLabel when provided", () => {
    const { getByLabelText } = render(
      <StatusBadge
        label="Success"
        variant="success"
        accessibilityLabel="Task completed successfully"
      />
    );
    expect(getByLabelText("Task completed successfully")).toBeTruthy();
  });

  it("hides icon from accessibility tree", () => {
    const { UNSAFE_getByType } = render(
      <StatusBadge label="Info" variant="info" icon="information-circle" />
    );
    // Find Ionicons component
    const icon = UNSAFE_getByType(Ionicons);
    expect(icon.props.importantForAccessibility).toBe("no");
    expect(icon.props.accessibilityElementsHidden).toBe(true);
  });

  it("works correctly with pulse animation", () => {
    const { getByLabelText } = render(
      <StatusBadge label="Live" variant="primary" pulse={true} />
    );
    const badge = getByLabelText("primary status: Live");
    expect(badge).toBeTruthy();
    expect(badge.props.accessible).toBe(true);
  });
});
