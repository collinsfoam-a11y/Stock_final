import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Tabs } from "../Tabs";
import { haptics } from "@/services/haptics";
import { View } from "react-native";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("Tabs", () => {
  const mockTabs = [
    { key: "tab1", label: "Tab 1", icon: <View testID="icon-1" /> },
    { key: "tab2", label: "Tab 2", badge: 5 },
    { key: "tab3", label: "Tab 3" },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders all tabs correctly", () => {
    const { getByText } = render(<Tabs tabs={mockTabs} activeTab="tab1" onTabChange={() => {}} />);

    expect(getByText("Tab 1")).toBeTruthy();
    expect(getByText("Tab 2")).toBeTruthy();
    expect(getByText("Tab 3")).toBeTruthy();
  });

  it("calls onTabChange and triggers haptics when a tab is pressed", () => {
    const onTabChange = jest.fn();
    const { getByText } = render(
      <Tabs tabs={mockTabs} activeTab="tab1" onTabChange={onTabChange} />
    );

    fireEvent.press(getByText("Tab 2"));

    expect(onTabChange).toHaveBeenCalledWith("tab2");
    expect(haptics.light).toHaveBeenCalled();
  });

  it("renders badge when provided", () => {
    const { getByText } = render(<Tabs tabs={mockTabs} activeTab="tab1" onTabChange={() => {}} />);

    expect(getByText("5")).toBeTruthy();
  });

  it("applies accessibilityRole='tab' to tab items", () => {
    const { getAllByRole } = render(
      <Tabs tabs={mockTabs} activeTab="tab1" onTabChange={() => {}} />
    );

    const tabs = getAllByRole("tab");
    expect(tabs.length).toBe(3);
  });

  it("marks the active tab as selected in accessibilityState", () => {
    const { getAllByRole } = render(
      <Tabs tabs={mockTabs} activeTab="tab2" onTabChange={() => {}} />
    );

    const tabs = getAllByRole("tab");
    expect(tabs[0].props.accessibilityState.selected).toBe(false);
    expect(tabs[1].props.accessibilityState.selected).toBe(true);
  });

  it("hides decorative icons from screen readers", () => {
    const { getByRole } = render(<Tabs tabs={mockTabs} activeTab="tab1" onTabChange={() => {}} />);

    const activeTab = getByRole("tab", { selected: true });
    const iconContainer = activeTab.children.find(
      (child: any) => child.props && child.props.accessibilityElementsHidden === true
    );

    expect(iconContainer).toBeTruthy();
    expect(iconContainer.props.importantForAccessibility).toBe("no");
    expect(iconContainer.props["aria-hidden"]).toBe(true);
  });
});
