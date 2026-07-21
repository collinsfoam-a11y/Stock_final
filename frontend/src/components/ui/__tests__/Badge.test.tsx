import React from "react";
import { render } from "@testing-library/react-native";
import { Badge } from "../Badge";

describe("Badge", () => {
  it("renders correctly with standard label", () => {
    const { getByText } = render(<Badge label="New" />);
    expect(getByText("New")).toBeTruthy();
  });

  it("applies standard React Native accessibility attributes by default", () => {
    const { getByLabelText } = render(<Badge label="Completed" />);
    const container = getByLabelText("Completed");

    expect(container).toBeTruthy();
    expect(container.props.accessible).toBe(true);
    expect(container.props.accessibilityRole).toBe("text");
  });

  it("allows overriding accessibilityRole and accessibilityLabel", () => {
    const { getByLabelText } = render(
      <Badge
        label="5"
        accessibilityLabel="5 unread messages"
        accessibilityRole="none"
      />
    );
    const container = getByLabelText("5 unread messages");

    expect(container).toBeTruthy();
    expect(container.props.accessible).toBe(true);
    expect(container.props.accessibilityRole).toBe("none");
  });

  it("renders correctly as a dot-only variant with appropriate accessibility attributes", () => {
    const { getByLabelText } = render(<Badge label="Unread status indicator" dot={true} />);
    const dot = getByLabelText("Unread status indicator");

    expect(dot).toBeTruthy();
    expect(dot.props.accessible).toBe(true);
    expect(dot.props.accessibilityRole).toBe("text");
  });

  it("renders dot-only variant with default status dot label when no label or override is provided", () => {
    const { getByLabelText } = render(<Badge label="" dot={true} />);
    const dot = getByLabelText("Status dot");

    expect(dot).toBeTruthy();
    expect(dot.props.accessible).toBe(true);
  });
});
