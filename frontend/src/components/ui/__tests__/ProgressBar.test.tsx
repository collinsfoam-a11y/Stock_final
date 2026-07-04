import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressBar } from "../ProgressBar";

describe("ProgressBar", () => {
  it("renders correctly", () => {
    const { getByRole } = render(<ProgressBar progress={50} animated={false} />);
    expect(getByRole("progressbar")).toBeTruthy();
  });

  it("has correct accessibility value", () => {
    const { getByRole } = render(<ProgressBar progress={75} animated={false} />);
    const progressBar = getByRole("progressbar");
    expect(progressBar.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 75,
    });
  });

  it("shows label when showLabel is true", () => {
    const { getByText } = render(<ProgressBar progress={60} showLabel animated={false} />);
    expect(getByText("60%")).toBeTruthy();
  });

  it("uses custom label when provided", () => {
    const { getByText, getByLabelText } = render(
      <ProgressBar progress={60} showLabel label="Loading items..." animated={false} />
    );
    expect(getByText("Loading items...")).toBeTruthy();
    expect(getByLabelText("Loading items...")).toBeTruthy();
  });
});
