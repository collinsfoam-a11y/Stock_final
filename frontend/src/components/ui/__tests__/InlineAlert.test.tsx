import React from "react";
import { render } from "@testing-library/react-native";
import { InlineAlert } from "../InlineAlert";
import { ThemeProvider } from "../../../context/ThemeContext";

describe("InlineAlert", () => {
  const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

  it("renders correctly with accessibility attributes", () => {
    const { getByLabelText, UNSAFE_getAllByType } = renderWithTheme(
      <InlineAlert type="error" message="Error message" />
    );
    const container = getByLabelText("error alert: Error message");
    expect(container.props.accessible).toBe(true);
    expect(container.props.accessibilityRole).toBe("alert");

    const icons = UNSAFE_getAllByType("Ionicons");
    expect(icons[0].props.accessibilityElementsHidden).toBe(true);
    expect(icons[0].props.importantForAccessibility).toBe("no");
  });

  it("uses 'text' role for non-error types", () => {
    const { getByLabelText } = renderWithTheme(<InlineAlert message="Info" />);
    expect(getByLabelText("info alert: Info").props.accessibilityRole).toBe("text");
  });
});
