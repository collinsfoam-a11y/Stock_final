import React from "react";
import { render } from "@testing-library/react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { InlineAlert } from "../InlineAlert";

describe("InlineAlert Component", () => {
  it("renders correctly with custom message and default type info", () => {
    const { getByText, getByLabelText } = render(<InlineAlert message="This is an info alert" />);

    expect(getByText("This is an info alert")).toBeTruthy();

    const container = getByLabelText("info alert: This is an info alert");
    expect(container.props.accessibilityRole).toBe("text");
  });

  it("applies correct accessibilityRole and label for error type", () => {
    const { getByLabelText } = render(
      <InlineAlert type="error" message="This is an error alert" />
    );

    const container = getByLabelText("error alert: This is an error alert");
    expect(container.props.accessibilityRole).toBe("alert");
  });

  it("applies correct accessibilityRole and label for warning type", () => {
    const { getByLabelText } = render(
      <InlineAlert type="warning" message="This is a warning alert" />
    );

    const container = getByLabelText("warning alert: This is a warning alert");
    expect(container.props.accessibilityRole).toBe("text");
  });

  it("hides decorative icons from screen readers", () => {
    const { UNSAFE_getByType } = render(<InlineAlert message="Hiding decorative icon" />);

    const icon = UNSAFE_getByType(Ionicons);
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no");
    expect(icon.props["aria-hidden"]).toBe(true);
  });
});
