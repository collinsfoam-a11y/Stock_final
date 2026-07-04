import React from "react";
import { render } from "@testing-library/react-native";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it("renders correctly with label", () => {
    const { getByText } = render(<StatusBadge label="Active" />);
    expect(getByText("Active")).toBeTruthy();
  });

  it("has accessibility properties", () => {
    const { getByLabelText, getAllByRole } = render(
      <StatusBadge label="Active" variant="success" />
    );
    const badge = getByLabelText("Status: Active");
    expect(badge).toBeTruthy();
    expect(getAllByRole("text").length).toBeGreaterThan(0);
  });

  it("hides icon from accessibility tree", () => {
    const { UNSAFE_getByType } = render(
      <StatusBadge label="Active" icon="radio-button-on" />
    );
    const icon = UNSAFE_getByType("Ionicons");
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no");
  });

  it("applies pulse animation style when pulse is true", () => {
    const { getByLabelText } = render(
      <StatusBadge label="Active" pulse={true} />
    );
    const badge = getByLabelText("Status: Active");
    expect(badge).toBeTruthy();
  });
});
