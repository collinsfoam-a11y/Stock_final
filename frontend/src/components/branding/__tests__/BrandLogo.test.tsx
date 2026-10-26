import React from "react";
import { render } from "@testing-library/react-native";
import { BrandLogo } from "../BrandLogo";

describe("BrandLogo", () => {
  it("renders with default accessibility properties", () => {
    const { getByLabelText } = render(<BrandLogo />);
    const logo = getByLabelText("Stock Verify logo");

    expect(logo).toBeTruthy();
    expect(logo.props.accessible).toBe(true);
    expect(logo.props.accessibilityRole).toBe("image");
  });

  it("supports custom accessibilityLabel and accessibilityHint", () => {
    const { getByLabelText } = render(
      <BrandLogo
        accessibilityLabel="Company Branding"
        accessibilityHint="Logo displayed on login screen"
      />
    );
    const logo = getByLabelText("Company Branding");

    expect(logo).toBeTruthy();
    expect(logo.props.accessibilityHint).toBe("Logo displayed on login screen");
  });

  it("supports disabling accessibility when marked decorative (accessible={false})", () => {
    const { queryByLabelText, getByTestId } = render(
      <BrandLogo accessible={false} testID="brand-logo" />
    );

    expect(queryByLabelText("Stock Verify logo")).toBeNull();
    const logo = getByTestId("brand-logo");
    expect(logo.props.accessible).toBe(false);
    expect(logo.props.accessibilityRole).toBeUndefined();
    expect(logo.props.accessibilityLabel).toBeUndefined();
  });
});
