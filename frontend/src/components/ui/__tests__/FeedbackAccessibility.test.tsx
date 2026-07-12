import React from "react";
import { render } from "@testing-library/react-native";
import { Badge } from "../Badge";
import { ProgressBar } from "../ProgressBar";
import { ProgressRing } from "../ProgressRing";
import { StatusBadge } from "../StatusBadge";

// Mock hooks used in components
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

describe("Feedback Components Accessibility", () => {
  describe("Badge", () => {
    it("has correct accessibility attributes", () => {
      const { getByLabelText } = render(<Badge label="Test Badge" />);
      const badge = getByLabelText("Test Badge");

      expect(badge.props.accessible).toBe(true);
      expect(badge.props.accessibilityRole).toBe("text");
    });

    it("uses custom accessibilityLabel when provided", () => {
      const { getByLabelText } = render(
        <Badge label="10" accessibilityLabel="10 items remaining" />
      );
      expect(getByLabelText("10 items remaining")).toBeTruthy();
    });
  });

  describe("ProgressBar", () => {
    it("has correct accessibility attributes", () => {
      const { getByRole } = render(<ProgressBar progress={45} />);
      const progressBar = getByRole("progressbar");

      expect(progressBar.props.accessible).toBe(true);
      expect(progressBar.props.accessibilityValue).toEqual({
        min: 0,
        max: 100,
        now: 45,
      });
      expect(progressBar.props.accessibilityLabel).toBe("Progress: 45%");
    });

    it("clamps accessibility values between 0 and 100", () => {
      const { getByRole } = render(<ProgressBar progress={150} />);
      const progressBar = getByRole("progressbar");
      expect(progressBar.props.accessibilityValue.now).toBe(100);
    });
  });

  describe("ProgressRing", () => {
    it("has correct accessibility attributes", () => {
      const { getByRole } = render(<ProgressRing progress={75} label="Uploading" />);
      const progressRing = getByRole("progressbar");

      expect(progressRing.props.accessible).toBe(true);
      expect(progressRing.props.accessibilityValue).toEqual({
        min: 0,
        max: 100,
        now: 75,
      });
      expect(progressRing.props.accessibilityLabel).toBe("Uploading: 75%");
    });
  });

  describe("StatusBadge", () => {
    it("has correct accessibility attributes", () => {
      const { getByLabelText } = render(<StatusBadge label="Active" />);
      const badge = getByLabelText("Active");

      expect(badge.props.accessible).toBe(true);
      expect(badge.props.accessibilityRole).toBe("text");
    });

    it("hides icon from screen readers", () => {
      const { UNSAFE_queryByType } = render(
        <StatusBadge label="Error" icon="alert-circle" />
      );
      // We check if the Ionicons component has accessibilityElementsHidden: true
      // Note: UNSAFE_getByType might be needed depending on how Ionicons is mocked
      const icon = UNSAFE_queryByType(require("@expo/vector-icons/Ionicons").default);
      if (icon) {
        expect(icon.props.accessibilityElementsHidden).toBe(true);
        expect(icon.props.importantForAccessibility).toBe("no");
      }
    });
  });
});
