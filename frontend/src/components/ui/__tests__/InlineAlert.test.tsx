import React from "react";
import { render } from "@testing-library/react-native";
import { InlineAlert } from "../InlineAlert";

describe("InlineAlert", () => {
  it("renders correctly with message", () => {
    const { getByText } = render(
      <InlineAlert type="info" message="This is an info message" />
    );
    expect(getByText("This is an info message")).toBeTruthy();
  });

  it("has correct accessibility attributes for standard type", () => {
    const { getByLabelText } = render(
      <InlineAlert type="info" message="This is an info message" />
    );
    const alert = getByLabelText("info alert: This is an info message");

    expect(alert.props.accessible).toBe(true);
    expect(alert.props.accessibilityRole).toBe("text");
  });

  it("has correct accessibility role for error type", () => {
    const { getByLabelText } = render(
      <InlineAlert type="error" message="Something went wrong" />
    );
    const alert = getByLabelText("error alert: Something went wrong");

    expect(alert.props.accessible).toBe(true);
    expect(alert.props.accessibilityRole).toBe("alert");
  });

  it("hides decorative icon from screen readers", () => {
    const { UNSAFE_queryByType } = render(
      <InlineAlert type="success" message="Operation successful" />
    );

    const icon = UNSAFE_queryByType(require("@expo/vector-icons/Ionicons").default);
    if (icon) {
      expect(icon.props.accessibilityElementsHidden).toBe(true);
      expect(icon.props.importantForAccessibility).toBe("no");
      expect(icon.props["aria-hidden"]).toBe(true);
    } else {
      fail("Ionicons icon not found in InlineAlert rendering subtree");
    }
  });
});
