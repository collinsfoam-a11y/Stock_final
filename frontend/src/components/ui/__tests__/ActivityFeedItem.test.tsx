import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ActivityFeedItem } from "../ActivityFeedItem";

describe("ActivityFeedItem", () => {
  const defaultProps = {
    type: "scan" as const,
    title: "Item Scanned",
    description: "Scanned barcode 123456 in Zone A",
    timestamp: new Date(),
  };

  it("renders non-interactive item correctly with accessibility label", () => {
    const { getByText, getByLabelText } = render(<ActivityFeedItem {...defaultProps} />);

    expect(getByText("Item Scanned")).toBeTruthy();
    expect(getByText("Scanned barcode 123456 in Zone A")).toBeTruthy();
    expect(getByText("Just now")).toBeTruthy();

    const accessibleContainer = getByLabelText("Item Scanned. Scanned barcode 123456 in Zone A. Just now");
    expect(accessibleContainer).toBeTruthy();
  });

  it("renders status indicator and includes status in accessibility label", () => {
    const { getByLabelText } = render(
      <ActivityFeedItem {...defaultProps} status="warning" />
    );

    const accessibleContainer = getByLabelText(
      "Item Scanned. Scanned barcode 123456 in Zone A. Status warning. Just now"
    );
    expect(accessibleContainer).toBeTruthy();
  });

  it("handles press events when onPress is provided", () => {
    const handlePress = jest.fn();
    const { getByText } = render(
      <ActivityFeedItem {...defaultProps} onPress={handlePress} />
    );

    const titleElement = getByText("Item Scanned");
    fireEvent.press(titleElement);

    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  it("hides decorative icons from screen readers", () => {
    const { UNSAFE_getAllByType } = render(
      <ActivityFeedItem {...defaultProps} onPress={jest.fn()} />
    );

    const Ionicons = require("@expo/vector-icons/Ionicons").default;
    const icons = UNSAFE_getAllByType(Ionicons);

    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon: any) => {
      expect(icon.props.accessibilityElementsHidden).toBe(true);
      expect(icon.props.importantForAccessibility).toBe("no");
    });
  });
});
