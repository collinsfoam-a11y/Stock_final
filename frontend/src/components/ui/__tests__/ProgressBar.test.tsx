import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressBar } from "../ProgressBar";

describe("ProgressBar", () => {
  it("renders correctly with default props", () => {
    const { getByTestId, getByText } = render(
      <ProgressBar progress={50} showLabel testID="progress-bar" />
    );

    const progressbar = getByTestId("progress-bar");
    expect(progressbar).toBeTruthy();
    expect(getByText("50%")).toBeTruthy();
  });

  it("applies correct accessibility attributes", () => {
    const { getByTestId } = render(
      <ProgressBar progress={75} label="Download Progress" testID="progress-bar" />
    );

    const progressbar = getByTestId("progress-bar");
    expect(progressbar.props.accessibilityRole).toBe("progressbar");
    expect(progressbar.props.accessibilityLabel).toBe("Download Progress");
    expect(progressbar.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 75,
      text: "Download Progress",
    });
  });

  it("clamps progress between 0 and 100", () => {
    const { getByTestId, rerender } = render(<ProgressBar progress={150} testID="progress-bar" />);

    let progressbar = getByTestId("progress-bar");
    expect(progressbar.props.accessibilityValue.now).toBe(100);

    rerender(<ProgressBar progress={-50} testID="progress-bar" />);
    progressbar = getByTestId("progress-bar");
    expect(progressbar.props.accessibilityValue.now).toBe(0);
  });

  it("uses provided accessibilityLabel over label prop", () => {
    const { getByTestId } = render(
      <ProgressBar
        progress={50}
        label="Visible Label"
        accessibilityLabel="Hidden Label"
        testID="progress-bar"
      />
    );

    const progressbar = getByTestId("progress-bar");
    expect(progressbar.props.accessibilityLabel).toBe("Hidden Label");
  });
});
