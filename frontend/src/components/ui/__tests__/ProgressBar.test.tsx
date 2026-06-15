import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressBar } from "../ProgressBar";
import { haptics } from "@/services/haptics";

// Mock haptics
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

// Mock reanimated
jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  Reanimated.default.call = () => {};
  return Reanimated;
});

describe("ProgressBar", () => {
  it("renders correctly", () => {
    const { getByTestId } = render(<ProgressBar progress={50} testID="progress-bar" />);
    const progressBar = getByTestId("progress-bar");
    expect(progressBar).toBeTruthy();
  });

  it("applies accessibility props", () => {
    const { getByTestId } = render(
      <ProgressBar progress={75} label="Loading items" testID="progress-bar" />
    );
    const progressBar = getByTestId("progress-bar");

    expect(progressBar.props.accessibilityRole).toBe("progressbar");
    expect(progressBar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 75 });
    expect(progressBar.props.accessibilityLabel).toBe("Loading items");
  });

  it("clamps progress value between 0 and 100 for accessibility", () => {
    const { getByTestId, rerender } = render(<ProgressBar progress={150} testID="progress-bar" />);
    let progressBar = getByTestId("progress-bar");
    expect(progressBar.props.accessibilityValue.now).toBe(100);

    rerender(<ProgressBar progress={-20} testID="progress-bar" />);
    progressBar = getByTestId("progress-bar");
    expect(progressBar.props.accessibilityValue.now).toBe(0);
  });
});
