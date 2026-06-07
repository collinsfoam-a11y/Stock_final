import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressBar } from "../ProgressBar";

describe("ProgressBar", () => {
  it("renders correctly", () => {
    const { getByText } = render(<ProgressBar progress={50} showLabel label="Progress" />);
    expect(getByText("Progress")).toBeTruthy();
  });

  it("has correct accessibility attributes", () => {
    const { getByTestId } = render(
      <ProgressBar progress={75} accessibilityLabel="Upload progress" testID="progress-bar" />
    );
    const progressBar = getByTestId("progress-bar");

    expect(progressBar.props.accessibilityRole).toBe("progressbar");
    expect(progressBar.props.accessibilityLabel).toBe("Upload progress");
    expect(progressBar.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 75,
    });
  });
});
