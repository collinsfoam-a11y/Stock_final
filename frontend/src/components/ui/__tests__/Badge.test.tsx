import React from "react";
import { View } from "react-native";
import { render } from "@testing-library/react-native";
import { Badge } from "../Badge";

describe("Badge", () => {
  it("renders correctly with label", () => {
    const { getByText } = render(<Badge label="5" />);
    expect(getByText("5")).toBeTruthy();
  });

  it("has correct accessibility attributes", () => {
    const { getByLabelText } = render(<Badge label="5" />);
    const badge = getByLabelText("5");

    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe("text");
  });

  it("has correct accessibility attributes in dot mode", () => {
    const { getByLabelText } = render(<Badge label="New" dot={true} />);
    const badge = getByLabelText("New");

    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe("text");
  });

  it("keeps empty string as accessibilityLabel if explicitly provided", () => {
    // We cannot reliably select by label text when it is empty string in this library version.
    // Instead we can use `getByText` and look for the wrapper container dynamically, or use UNSAFE_getByType
    const { UNSAFE_getByType } = render(<Badge label="5" accessibilityLabel="" />);
    const badgeView = UNSAFE_getByType(View);

    expect(badgeView.props.accessible).toBe(true);
    expect(badgeView.props.accessibilityLabel).toBe("");
  });
});
