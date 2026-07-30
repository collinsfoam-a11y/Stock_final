import React from "react";
import { render } from "@testing-library/react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { InlineAlert } from "../InlineAlert";

describe("InlineAlert Component", () => {
  it("renders correctly with message", () => {
    const { getByText } = render(
      <InlineAlert type="info" message="This is an informational alert" />
    );

    expect(getByText("This is an informational alert")).toBeTruthy();
  });

  it("applies correct accessibility attributes for type info", () => {
    const { getByLabelText } = render(<InlineAlert type="info" message="This is info" />);

    const alertContainer = getByLabelText("info alert: This is info");
    expect(alertContainer.props.accessibilityRole).toBe("text");
  });

  it("applies correct accessibility attributes for type error", () => {
    const { getByLabelText } = render(<InlineAlert type="error" message="This is an error" />);

    const alertContainer = getByLabelText("error alert: This is an error");
    expect(alertContainer.props.accessibilityRole).toBe("alert");
  });

  it("hides decorative icon from screen readers", () => {
    const { UNSAFE_getByType } = render(<InlineAlert type="warning" message="This is a warning" />);

    const icon = UNSAFE_getByType(Ionicons);
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no");
    expect(icon.props["aria-hidden"]).toBe(true);
  });
});
