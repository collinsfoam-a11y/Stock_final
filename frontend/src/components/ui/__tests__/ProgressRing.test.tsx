import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressRing } from "../ProgressRing";

// Mock hooks
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
      enabled: true,
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
  it("renders correctly", () => {
    const { getByRole } = render(<ProgressRing progress={45} />);
    expect(getByRole("progressbar")).toBeTruthy();
  });

  it("has correct accessibility value", () => {
    const { getByRole } = render(<ProgressRing progress={80} />);
    const progressRing = getByRole("progressbar");
    expect(progressRing.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 80,
    });
  });

  it("shows percentage text when showPercentage is true", () => {
    const { getByText } = render(<ProgressRing progress={25} showPercentage />);
    expect(getByText("25%")).toBeTruthy();
  });

  it("shows label when provided", () => {
    const { getByText } = render(<ProgressRing progress={25} label="Tasks" />);
    expect(getByText("Tasks")).toBeTruthy();
  });
});
