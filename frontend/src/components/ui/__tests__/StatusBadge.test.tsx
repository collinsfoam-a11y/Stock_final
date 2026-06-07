import React from "react";
import { render } from "@testing-library/react-native";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it("renders correctly with label", () => {
    const { getByText } = render(<StatusBadge label="ACTIVE" />);
    expect(getByText("ACTIVE")).toBeTruthy();
  });

  it("hides the icon from accessibility tree", () => {
    const { getByText, UNSAFE_queryAllByProps } = render(
      <StatusBadge label="WARNING" icon="warning" />
    );

    expect(getByText("WARNING")).toBeTruthy();

    // Check for elements with accessibilityElementsHidden={true}
    const hiddenElements = UNSAFE_queryAllByProps({ accessibilityElementsHidden: true });
    expect(hiddenElements.length).toBeGreaterThanOrEqual(1);

    const icon = hiddenElements[0];
    expect(icon.props.importantForAccessibility).toBe("no");
    expect(icon.props["aria-hidden"]).toBe(true);
  });
});
