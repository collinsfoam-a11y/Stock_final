import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressBar } from "../ProgressBar";

describe("ProgressBar", () => {
  it("renders correctly", () => {
    const { getByRole } = render(<ProgressBar progress={50} />);
    expect(getByRole("progressbar")).toBeTruthy();
  });

  it("has correct accessibility attributes", () => {
    const { getByRole } = render(<ProgressBar progress={75} />);
    const progressBar = getByRole("progressbar");

    expect(progressBar.props.accessible).toBe(true);
    expect(progressBar.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 75,
    });
    expect(progressBar.props.accessibilityLabel).toBe("Progress: 75%");
  });

  it("uses custom label for accessibility if provided", () => {
    const { getByRole } = render(
      <ProgressBar progress={50} label="Syncing items..." />
    );
    const progressBar = getByRole("progressbar");

    expect(progressBar.props.accessibilityLabel).toBe("Progress: Syncing items...");
  });

  it("clamps progress value for accessibility", () => {
    const { getByRole, rerender } = render(<ProgressBar progress={150} />);
    const progressBar = getByRole("progressbar");
    expect(progressBar.props.accessibilityValue.now).toBe(100);
    expect(progressBar.props.accessibilityLabel).toBe("Progress: 100%");

    rerender(<ProgressBar progress={-20} />);
    const progressBarNegative = getByRole("progressbar");
    expect(progressBarNegative.props.accessibilityValue.now).toBe(0);
    expect(progressBarNegative.props.accessibilityLabel).toBe("Progress: 0%");
  });
});
