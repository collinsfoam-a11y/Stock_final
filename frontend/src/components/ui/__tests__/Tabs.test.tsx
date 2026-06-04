import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Tabs } from "../Tabs";
import { haptics } from "@/services/haptics";
import { Text, View } from "react-native";

// Mock haptics
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe("Tabs", () => {
  const mockTabs = [
    { key: "tab1", label: "Tab 1", icon: <Text testID="icon1">Icon 1</Text> },
    { key: "tab2", label: "Tab 2" },
  ];
  const onTabChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with provided tabs", () => {
    const { getByText } = render(
      <Tabs tabs={mockTabs} activeTab="tab1" onTabChange={onTabChange} />
    );

    expect(getByText("Tab 1")).toBeTruthy();
    expect(getByText("Tab 2")).toBeTruthy();
  });

  it("calls onTabChange when a tab is pressed", () => {
    const { getByText } = render(
      <Tabs tabs={mockTabs} activeTab="tab1" onTabChange={onTabChange} />
    );

    fireEvent.press(getByText("Tab 2"));
    expect(onTabChange).toHaveBeenCalledWith("tab2");
  });

  it("triggers haptics.light upon interaction", () => {
    const { getByText } = render(
      <Tabs tabs={mockTabs} activeTab="tab1" onTabChange={onTabChange} />
    );

    fireEvent.press(getByText("Tab 2"));
    expect(haptics.light).toHaveBeenCalled();
  });

  it("applies correct accessibility roles and states", () => {
    const { getByText } = render(
      <Tabs tabs={mockTabs} activeTab="tab1" onTabChange={onTabChange} />
    );

    // The parent of the Text is the TouchableOpacity if not using a wrapper
    // In our implementation, renderTab returns TouchableOpacity which contains Text.
    // getByText returns the Text component.

    // Find the touchable parent
    const findTouchable = (node: any): any => {
      if (!node) return null;
      if (node.props.accessibilityRole === "tab") return node;
      return findTouchable(node.parent);
    };

    const touchable1 = findTouchable(getByText("Tab 1"));
    const touchable2 = findTouchable(getByText("Tab 2"));

    expect(touchable1.props.accessibilityRole).toBe("tab");
    expect(touchable1.props.accessibilityState.selected).toBe(true);

    expect(touchable2.props.accessibilityRole).toBe("tab");
    expect(touchable2.props.accessibilityState.selected).toBe(false);
  });

  it("hides icons from accessibility tree", () => {
    const { UNSAFE_getAllByType } = render(
      <Tabs tabs={mockTabs} activeTab="tab1" onTabChange={onTabChange} />
    );

    // Let's use a more direct way if possible.
    const allViews = UNSAFE_getAllByType(View);
    const target = allViews.find(v => v.props.accessibilityElementsHidden === true);

    expect(target).toBeTruthy();
    expect(target.props.importantForAccessibility).toBe("no");
    expect(target.props["aria-hidden"]).toBe(true);
  });
});
