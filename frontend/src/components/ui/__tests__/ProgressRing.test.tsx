import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressRing } from "../ProgressRing";

describe("ProgressRing", () => {
  it("renders correctly with default props", () => {
    const { getByRole } = render(<ProgressRing progress={65} />);
    const progressRing = getByRole("progressbar");

    expect(progressRing).toBeTruthy();
    expect(progressRing.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 65,
    });
  });

  it("applies custom accessibilityLabel when label is provided", () => {
    const { getByLabelText } = render(
      <ProgressRing progress={80} label="Syncing database" />
    );

    const progressRing = getByLabelText("Syncing database");
    expect(progressRing).toBeTruthy();
    expect(progressRing.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 80,
    });
  });

  it("falls back to default label when none is provided", () => {
    const { getByLabelText } = render(<ProgressRing progress={40} />);

    const progressRing = getByLabelText("Progress ring");
    expect(progressRing).toBeTruthy();
  });

  it("handles negative and clamped progress values correctly", () => {
    const { getByRole } = render(<ProgressRing progress={-5} />);
    const progressRing = getByRole("progressbar");

    expect(progressRing.props.accessibilityValue.now).toBe(-5);
  });
});
