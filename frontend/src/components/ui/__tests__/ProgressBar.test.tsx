import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressBar } from "../ProgressBar";

describe("ProgressBar", () => {
  it("renders correctly with progress", () => {
    const { getByText } = render(<ProgressBar progress={50} showLabel={true} />);
    expect(getByText("50%")).toBeTruthy();
  });

  it("renders with custom label", () => {
    const { getByText } = render(<ProgressBar progress={50} showLabel={true} label="Loading..." />);
    expect(getByText("Loading...")).toBeTruthy();
  });

  it("has correct accessibility attributes", () => {
    const { getByTestId } = render(
      <ProgressBar progress={75} label="Syncing" testID="progress-bar" />
    );

    const progressBar = getByTestId("progress-bar");

    expect(progressBar.props.accessibilityRole).toBe("progressbar");
    expect(progressBar.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 75,
    });
    expect(progressBar.props.accessibilityLabel).toBe("Syncing");
  });

  it("uses default accessibility label when none is provided", () => {
    const { getByTestId } = render(<ProgressBar progress={30} testID="progress-bar" />);
    const progressBar = getByTestId("progress-bar");
    expect(progressBar.props.accessibilityLabel).toBe("Progress");
  });

  it("clamps progress between 0 and 100 for accessibilityValue", () => {
    const { getByTestId, rerender } = render(<ProgressBar progress={-10} testID="progress-bar" />);
    let progressBar = getByTestId("progress-bar");
    expect(progressBar.props.accessibilityValue.now).toBe(0);

    rerender(<ProgressBar progress={150} testID="progress-bar" />);
    progressBar = getByTestId("progress-bar");
    expect(progressBar.props.accessibilityValue.now).toBe(100);
  });
});
