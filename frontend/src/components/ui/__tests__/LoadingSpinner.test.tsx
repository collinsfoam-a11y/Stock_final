import React from "react";
import { render } from "@testing-library/react-native";
import { LoadingSpinner } from "../LoadingSpinner";

describe("LoadingSpinner Accessibility", () => {
  it("has correct accessibility attributes", () => {
    const { getByRole, getByLabelText } = render(<LoadingSpinner />);

    const spinner = getByRole("progressbar");
    expect(spinner).toBeTruthy();
    expect(spinner.props.accessible).toBe(true);
    expect(spinner.props.accessibilityLiveRegion).toBe("polite");

    expect(getByLabelText("Loading")).toBeTruthy();
  });

  it("supports custom accessibility label", () => {
    const customLabel = "Saving data...";
    const { getByLabelText } = render(<LoadingSpinner accessibilityLabel={customLabel} />);

    expect(getByLabelText(customLabel)).toBeTruthy();
  });

  it("is not rendered when isVisible is false", () => {
    const { queryByRole } = render(<LoadingSpinner isVisible={false} />);
    expect(queryByRole("progressbar")).toBeNull();
  });
});
