import React from "react";
import { render } from "@testing-library/react-native";
import { Badge } from "../Badge";

describe("Badge", () => {
  it("renders label correctly", () => {
    const { getByText } = render(<Badge label="New" />);
    expect(getByText("New")).toBeTruthy();
  });

  it("has correct accessibility attributes for regular badge", () => {
    const { getByLabelText } = render(<Badge label="Completed" />);
    const badge = getByLabelText("Completed");

    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe("text");
  });

  it("has correct accessibility attributes for dot variant", () => {
    const { getByLabelText } = render(<Badge label="Online" dot={true} variant="success" />);
    const dot = getByLabelText("Online indicator");

    expect(dot.props.accessible).toBe(true);
    expect(dot.props.accessibilityRole).toBe("text");
  });

  it("uses variant indicator label for dot variant when label is an empty string", () => {
    const { getByLabelText } = render(<Badge label="" dot={true} variant="error" />);
    expect(getByLabelText("error indicator")).toBeTruthy();
  });

  it("uses variant name for dot indicator when label is undefined (if it were possible)", () => {
      // @ts-ignore - testing runtime behavior
      const { getByLabelText } = render(<Badge label={undefined} dot={true} variant="warning" />);
      expect(getByLabelText("warning indicator")).toBeTruthy();
  });
});
