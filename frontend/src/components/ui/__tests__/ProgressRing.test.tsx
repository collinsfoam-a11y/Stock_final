import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressRing } from "../ProgressRing";

// Mock hooks and utils
jest.mock("@/hooks/useUiTokens", () => ({
  useUiTokens: () => ({
    colors: {
      accent: "#000",
      accentStrong: "#111",
      border: "#222",
      textPrimary: "#333",
      textSecondary: "#444",
    },
    spacing: {
      xs: 4,
    },
    motion: {
      durations: {
        slow: 300,
      },
    },
  }),
}));

jest.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

describe("ProgressRing", () => {
  it("renders correctly with progress", () => {
    const { getByRole } = render(<ProgressRing progress={45} />);
    const progressRing = getByRole("progressbar");
    expect(progressRing).toBeTruthy();
  });

  it("has correct accessibility value", () => {
    const { getByRole } = render(<ProgressRing progress={75} />);
    const progressRing = getByRole("progressbar");

    expect(progressRing.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 75,
    });
  });

  it("uses default accessibility label when not provided", () => {
    const { getByLabelText } = render(<ProgressRing progress={50} />);
    expect(getByLabelText("Progress")).toBeTruthy();
  });

  it("uses custom accessibility label when provided", () => {
    const { getByLabelText } = render(
      <ProgressRing progress={50} label="System Load" />
    );
    expect(getByLabelText("System Load")).toBeTruthy();
  });

  it("clamps progress value for accessibility", () => {
    const { getByRole, rerender } = render(<ProgressRing progress={150} />);
    let progressRing = getByRole("progressbar");
    expect(progressRing.props.accessibilityValue.now).toBe(100);

    rerender(<ProgressRing progress={-20} />);
    progressRing = getByRole("progressbar");
    expect(progressRing.props.accessibilityValue.now).toBe(0);
  });
});
