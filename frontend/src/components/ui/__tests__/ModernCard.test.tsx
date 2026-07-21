import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";

import ModernCard from "../ModernCard";

// No ThemeProvider is mounted here: this exercises the documented
// provider-less fallback path (useThemeContextSafe -> undefined -> semantic
// fallbacks). The card must still render its children and honour an explicit
// consumer style override.
describe("ModernCard", () => {
  it("renders children without a ThemeProvider (fallback path)", () => {
    const { getByText } = render(
      <ModernCard testID="card">
        <Text>Card body</Text>
      </ModernCard>,
    );
    expect(getByText("Card body")).toBeTruthy();
  });

  it("lets an explicit consumer style override the runtime surface", () => {
    const OVERRIDE = "rgb(1, 2, 3)";
    const { getByTestId } = render(
      <ModernCard testID="card" style={{ backgroundColor: OVERRIDE }}>
        <Text>Body</Text>
      </ModernCard>,
    );
    // The consumer style is applied last in the card style array, so it wins.
    const card = getByTestId("card");
    const flattened = ([] as any[])
      .concat(card.props.style)
      .flat(Infinity)
      .filter(Boolean);
    const hasOverride = flattened.some(
      (s: any) => s && s.backgroundColor === OVERRIDE,
    );
    expect(hasOverride).toBe(true);
  });

  it("renders the outlined variant without crashing", () => {
    const { getByText } = render(
      <ModernCard testID="card" variant="outlined">
        <Text>Outlined</Text>
      </ModernCard>,
    );
    expect(getByText("Outlined")).toBeTruthy();
  });
});
