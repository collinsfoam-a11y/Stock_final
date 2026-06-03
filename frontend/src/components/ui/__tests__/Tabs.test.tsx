import React from "react";
import { View } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { Tabs, Tab } from "../Tabs";
import { haptics } from "@/services/haptics";

// Mock haptics
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

const mockTabs: Tab[] = [
  { key: "tab1", label: "Tab 1", icon: <View testID="tab1-icon" /> },
  { key: "tab2", label: "Tab 2" },
];

describe("Tabs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly", () => {
    const { getByText } = render(<Tabs tabs={mockTabs} activeTab="tab1" onTabChange={jest.fn()} />);
    expect(getByText("Tab 1")).toBeTruthy();
    expect(getByText("Tab 2")).toBeTruthy();
  });

  it("triggers onTabChange and haptics when a tab is pressed", () => {
    const onTabChange = jest.fn();
    const { getByText } = render(
      <Tabs tabs={mockTabs} activeTab="tab1" onTabChange={onTabChange} />
    );

    fireEvent.press(getByText("Tab 2"));

    expect(onTabChange).toHaveBeenCalledWith("tab2");
    expect(haptics.light).toHaveBeenCalled();
  });

  it("applies correct accessibility attributes to tabs", () => {
    const { getByRole } = render(<Tabs tabs={mockTabs} activeTab="tab1" onTabChange={jest.fn()} />);

    const tab1 = getByRole("tab", { name: "Tab 1" });
    const tab2 = getByRole("tab", { name: "Tab 2" });

    expect(tab1.props.accessibilityState.selected).toBe(true);
    expect(tab2.props.accessibilityState.selected).toBe(false);
  });

  it("hides icons from accessibility tree", () => {
    const { getByRole } = render(<Tabs tabs={mockTabs} activeTab="tab1" onTabChange={jest.fn()} />);

    const tab = getByRole("tab", { name: "Tab 1" });
    // The tab is the TouchableOpacity. We need to find the icon container among its children.
    const iconContainer: any = tab.children.find(
      (child: any) =>
        child &&
        typeof child === "object" &&
        "props" in child &&
        child.props.accessibilityElementsHidden === true
    );

    expect(iconContainer).toBeTruthy();
    expect(iconContainer.props.importantForAccessibility).toBe("no");
    expect(iconContainer.props["aria-hidden"]).toBe(true);
  });
});
