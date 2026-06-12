import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Tabs } from "../Tabs";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({ haptics: { light: jest.fn() } }));

describe("Tabs", () => {
  it("renders and triggers haptics on press", () => {
    const mockTabs = [{ key: "t1", label: "Tab 1" }, { key: "t2", label: "Tab 2" }];
    const onTabChange = jest.fn();
    const { getByText, getByRole } = render(
      <Tabs tabs={mockTabs} activeTab="t1" onTabChange={onTabChange} />
    );
    expect(getByText("Tab 1")).toBeTruthy();
    fireEvent.press(getByText("Tab 2"));
    expect(onTabChange).toHaveBeenCalledWith("t2");
    expect(haptics.light).toHaveBeenCalled();
    const tab1 = getByRole("tab", { name: /Tab 1/i });
    expect(tab1.props.accessibilityState.selected).toBe(true);
  });
});
