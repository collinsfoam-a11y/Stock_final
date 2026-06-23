import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressBar } from "../ProgressBar";

describe("ProgressBar", () => {
  it("renders correctly with progress", () => {
    const { getByRole } = render(<ProgressBar progress={45} />);
    const progressBar = getByRole("progressbar");
    expect(progressBar).toBeTruthy();
  });

  it("has correct accessibility value", () => {
    const { getByRole } = render(<ProgressBar progress={75} />);
    const progressBar = getByRole("progressbar");

    expect(progressBar.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 75,
    });
  });

  it("uses default accessibility label when not provided", () => {
    const { getByLabelText } = render(<ProgressBar progress={50} />);
    expect(getByLabelText("Progress")).toBeTruthy();
  });

  it("uses custom accessibility label when provided", () => {
    const { getByLabelText } = render(
      <ProgressBar progress={50} label="Loading items" />
    );
    expect(getByLabelText("Loading items")).toBeTruthy();
  });

  it("clamps progress value for accessibility", () => {
    const { getByRole, rerender } = render(<ProgressBar progress={120} />);
    let progressBar = getByRole("progressbar");
    expect(progressBar.props.accessibilityValue.now).toBe(100);

    rerender(<ProgressBar progress={-10} />);
    progressBar = getByRole("progressbar");
    expect(progressBar.props.accessibilityValue.now).toBe(0);
  });
});
