import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressBar } from "../ProgressBar";

describe("ProgressBar", () => {
  it("renders correctly with given progress", () => {
    const { getByText } = render(<ProgressBar progress={50} showLabel={true} />);
    expect(getByText("50%")).toBeTruthy();
  });

  it("renders with custom label", () => {
    const { getByText } = render(<ProgressBar progress={75} showLabel={true} label="Loading..." />);
    expect(getByText("Loading...")).toBeTruthy();
  });

  it("clamped progress values in label", () => {
    const { getByText: getByTextOver } = render(<ProgressBar progress={120} showLabel={true} />);
    expect(getByTextOver("120%")).toBeTruthy();
  });

  it("has correct accessibility attributes", () => {
    const { getByTestId } = render(
      <ProgressBar progress={60} testID="progress-bar" label="Downloading" />
    );
    const progressBar = getByTestId("progress-bar");

    expect(progressBar.props.accessibilityRole).toBe("progressbar");
    expect(progressBar.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 60,
    });
    expect(progressBar.props.accessibilityLabel).toBe("Downloading");
  });

  it("clamps accessibility value to 100", () => {
    const { getByTestId } = render(<ProgressBar progress={150} testID="progress-bar-clamped" />);
    const progressBar = getByTestId("progress-bar-clamped");

    expect(progressBar.props.accessibilityValue.now).toBe(100);
  });
});
