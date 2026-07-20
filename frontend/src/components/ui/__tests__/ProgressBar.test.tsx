import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressBar } from "../ProgressBar";

describe("ProgressBar", () => {
  it("renders correctly with default props", () => {
    const { getByRole } = render(<ProgressBar progress={45} />);
    const progressBar = getByRole("progressbar");

    expect(progressBar).toBeTruthy();
    expect(progressBar.props.accessibilityState).toBeUndefined(); // Standard progressbar role doesn't strictly require state, only value
    expect(progressBar.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 45,
    });
  });

  it("applies the custom accessibilityLabel", () => {
    const { getByLabelText } = render(
      <ProgressBar progress={75} label="Uploading file" />
    );

    const progressBar = getByLabelText("Uploading file");
    expect(progressBar).toBeTruthy();
    expect(progressBar.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 75,
    });
  });

  it("falls back to default label when none is provided", () => {
    const { getByLabelText } = render(<ProgressBar progress={30} />);

    const progressBar = getByLabelText("Progress bar");
    expect(progressBar).toBeTruthy();
  });

  it("clamps negative progress in accessibility value or represents actual progress correctly", () => {
    const { getByRole } = render(<ProgressBar progress={-10} />);
    const progressBar = getByRole("progressbar");

    expect(progressBar.props.accessibilityValue.now).toBe(-10);
  });

  it("handles progress above 100", () => {
    const { getByRole } = render(<ProgressBar progress={150} />);
    const progressBar = getByRole("progressbar");

    expect(progressBar.props.accessibilityValue.now).toBe(150);
  });
});
