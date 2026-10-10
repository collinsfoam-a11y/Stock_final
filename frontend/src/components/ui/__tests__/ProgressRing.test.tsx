import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressRing } from "../ProgressRing";

// Mock hooks used in ProgressRing
jest.mock("@/hooks/useUiTokens", () => ({
  useUiTokens: () => ({
    colors: {
      accent: "#000",
      accentStrong: "#fff",
      border: "#ccc",
      textPrimary: "#000",
      textSecondary: "#666",
    },
    spacing: {
      xs: 4,
    },
    motion: {
      slow: 300,
    },
  }),
}));

jest.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

describe("ProgressRing", () => {
  it("renders correctly", () => {
    const { getByRole } = render(<ProgressRing progress={50} />);
    expect(getByRole("progressbar")).toBeTruthy();
  });

  it("has correct accessibility attributes", () => {
    const { getByRole } = render(<ProgressRing progress={40} label="Completed" />);
    const progressRing = getByRole("progressbar");

    expect(progressRing.props.accessible).toBe(true);
    expect(progressRing.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 40,
    });
    expect(progressRing.props.accessibilityLabel).toBe("Progress: Completed (40%)");
  });

  it("uses default accessibility label when no label is provided or label is empty/whitespace", () => {
    const { getByRole: getByRoleNoLabel } = render(<ProgressRing progress={60} />);
    expect(getByRoleNoLabel("progressbar").props.accessibilityLabel).toBe("Progress: 60%");

    const { getByRole: getByRoleWhitespace } = render(<ProgressRing progress={60} label="   " />);
    expect(getByRoleWhitespace("progressbar").props.accessibilityLabel).toBe("Progress: 60%");
  });

  it("clamps progress value for accessibility", () => {
    const { getByRole } = render(<ProgressRing progress={120} />);
    const progressRing = getByRole("progressbar");
    expect(progressRing.props.accessibilityValue.now).toBe(100);
    expect(progressRing.props.accessibilityLabel).toBe("Progress: 100%");
  });
});
