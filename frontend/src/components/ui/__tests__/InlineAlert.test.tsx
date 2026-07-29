import React from "react";
import { render } from "@testing-library/react-native";
import { InlineAlert } from "../InlineAlert";

describe("InlineAlert", () => {
  it("renders correctly with message", () => {
    const { getByText } = render(<InlineAlert message="This is an alert" />);
    expect(getByText("This is an alert")).toBeTruthy();
  });

  it("has correct accessibility attributes for default info type", () => {
    const { getByLabelText } = render(<InlineAlert message="This is an alert" />);
    const alert = getByLabelText("info alert: This is an alert");

    expect(alert.props.accessibilityRole).toBe("text");
  });

  it("has correct accessibility attributes for error type", () => {
    const { getByLabelText } = render(
      <InlineAlert type="error" message="This is an error" />
    );
    const alert = getByLabelText("error alert: This is an error");

    expect(alert.props.accessibilityRole).toBe("alert");
  });

  it("hides decorative icon from screen readers", () => {
    const { UNSAFE_queryByType } = render(
      <InlineAlert type="warning" message="This is a warning" />
    );

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const icon = UNSAFE_queryByType(require("@expo/vector-icons/Ionicons").default);
    if (icon) {
      expect(icon.props.accessibilityElementsHidden).toBe(true);
      expect(icon.props.importantForAccessibility).toBe("no");
    }
  });
});
