import React from "react";
import { render } from "@testing-library/react-native";
import { LoadingSpinner } from "../LoadingSpinner";

describe("LoadingSpinner", () => {
  it("renders correctly with accessibility props", () => {
    const { getByRole } = render(<LoadingSpinner isVisible={true} />);

    const spinner = getByRole("progressbar");
    expect(spinner).toBeTruthy();
    expect(spinner.props.accessibilityLabel).toBe("Loading");
    expect(spinner.props.accessibilityLiveRegion).toBe("polite");
    expect(spinner.props.accessible).toBe(true);
  });

  it("renders with custom accessibility label", () => {
    const customLabel = "Updating data...";
    const { getByLabelText } = render(
      <LoadingSpinner isVisible={true} accessibilityLabel={customLabel} />
    );

    expect(getByLabelText(customLabel)).toBeTruthy();
  });

  it("returns null when isVisible is false", () => {
    const { queryByRole } = render(<LoadingSpinner isVisible={false} />);
    expect(queryByRole("progressbar")).toBeNull();
  });
});
