import React from "react";
import { View } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { Tabs, Tab } from "../Tabs";
import { haptics } from "@/services/haptics";

// Mock haptics
jest.mock("@/services/haptics", () => ({
  haptics: {
    selection: jest.fn(),
  },
}));

const mockTabs: Tab[] = [
  { key: "all", label: "All Items", icon: <View /> },
  { key: "pending", label: "Pending", badge: 5 },
  { key: "synced", label: "Synced", badge: 0 },
];

describe("Tabs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders tabs correctly with labels and badges", () => {
    const onTabChange = jest.fn();
    const { getByText, queryByText } = render(
      <Tabs tabs={mockTabs} activeTab="all" onTabChange={onTabChange} />
    );

    expect(getByText("All Items")).toBeTruthy();
    expect(getByText("Pending")).toBeTruthy();
    expect(getByText("Synced")).toBeTruthy();

    // Pending has badge 5
    expect(getByText("5")).toBeTruthy();

    // Synced has badge 0, so no badge should be rendered
    expect(queryByText("0")).toBeNull();
  });

  it("triggers onTabChange and selection haptics when tab is pressed", () => {
    const onTabChange = jest.fn();
    const { getByText } = render(
      <Tabs tabs={mockTabs} activeTab="all" onTabChange={onTabChange} />
    );

    fireEvent.press(getByText("Pending"));

    expect(onTabChange).toHaveBeenCalledWith("pending");
    expect(haptics.selection).toHaveBeenCalledTimes(1);
  });

  it("applies correct accessibility attributes for role and state", () => {
    const onTabChange = jest.fn();
    const { getByRole } = render(
      <Tabs tabs={mockTabs} activeTab="all" onTabChange={onTabChange} />
    );

    const activeTabButton = getByRole("tab", { name: "All Items" });
    const inactiveTabButton = getByRole("tab", { name: "Pending" });

    expect(activeTabButton.props.accessibilityState.selected).toBe(true);
    expect(inactiveTabButton.props.accessibilityState.selected).toBe(false);
  });

  it("hides decorative icons from screen readers", () => {
    const onTabChange = jest.fn();
    const { getByRole } = render(
      <Tabs tabs={mockTabs} activeTab="all" onTabChange={onTabChange} />
    );

    const activeTabButton = getByRole("tab", { name: "All Items" });

    // Find the first child of the activeTabButton which is the icon container View
    const children = React.Children.toArray(activeTabButton.props.children);
    const iconContainer: any = children[0];

    expect(iconContainer).toBeTruthy();
    expect(iconContainer.props.accessibilityElementsHidden).toBe(true);
    expect(iconContainer.props.importantForAccessibility).toBe("no");
    expect(iconContainer.props["aria-hidden"]).toBe(true);
  });
});
