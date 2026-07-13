import React from "react";
import { render } from "@testing-library/react-native";
import { Badge } from "../Badge";
import { StatusBadge } from "../StatusBadge";
import { ProgressBar } from "../ProgressBar";
import { ProgressRing } from "../ProgressRing";

// Mock Ionicons to simplify icon verification
jest.mock("@expo/vector-icons/Ionicons", () => "Ionicons");

describe("Feedback Components Accessibility", () => {
  describe("Badge", () => {
    it("has correct accessibility attributes", () => {
      const { getByLabelText } = render(
        <Badge label="New" accessibilityLabel="New items available" />
      );
      const badge = getByLabelText("New items available");
      expect(badge.props.accessible).toBe(true);
      expect(badge.props.accessibilityRole).toBe("text");
    });

    it("uses label as default accessibilityLabel for dot variant", () => {
      const { getByLabelText } = render(<Badge label="Alert" dot={true} />);
      const badge = getByLabelText("Alert");
      expect(badge.props.accessibilityRole).toBe("text");
    });
  });

  describe("StatusBadge", () => {
    it("has correct accessibility attributes", () => {
      const { getByLabelText } = render(
        <StatusBadge label="Completed" variant="success" />
      );
      const badge = getByLabelText("Completed");
      expect(badge.props.accessible).toBe(true);
      expect(badge.props.accessibilityRole).toBe("text");
    });

    it("hides decorative icon from screen readers", () => {
      const { UNSAFE_getByType } = render(
        <StatusBadge label="Active" icon="radio-button-on" />
      );
      const icon = UNSAFE_getByType("Ionicons");
      expect(icon.props.accessibilityElementsHidden).toBe(true);
      expect(icon.props.importantForAccessibility).toBe("no");
    });
  });

  describe("ProgressBar", () => {
    it("has correct accessibility attributes", () => {
      const { getByRole } = render(
        <ProgressBar progress={45} accessibilityLabel="Upload progress" />
      );
      const progressBar = getByRole("progressbar");
      expect(progressBar.props.accessible).toBe(true);
      expect(progressBar.props.accessibilityValue).toEqual({
        min: 0,
        max: 100,
        now: 45,
      });
      expect(progressBar.props.accessibilityLabel).toBe("Upload progress");
    });
  });

  describe("ProgressRing", () => {
    it("has correct accessibility attributes", () => {
      const { getByRole } = render(
        <ProgressRing progress={75} accessibilityLabel="Task completion" />
      );
      const progressRing = getByRole("progressbar");
      expect(progressRing.props.accessible).toBe(true);
      expect(progressRing.props.accessibilityValue).toEqual({
        min: 0,
        max: 100,
        now: 75,
      });
      expect(progressRing.props.accessibilityLabel).toBe("Task completion");
    });
  });
});
