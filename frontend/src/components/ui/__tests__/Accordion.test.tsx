import React from "react";
import { Text, View } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { Accordion, AccordionItem } from "../Accordion";
import { haptics } from "@/services/haptics";

// Mock haptics service
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

const mockItems: AccordionItem[] = [
  {
    id: "1",
    title: "Item 1",
    content: <View><Text>Content 1</Text></View>,
  },
  {
    id: "2",
    title: "Item 2",
    content: <View><Text>Content 2</Text></View>,
  },
];

describe("Accordion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly", () => {
    const { getByText, queryByText } = render(<Accordion items={mockItems} />);

    expect(getByText("Item 1")).toBeTruthy();
    expect(getByText("Item 2")).toBeTruthy();

    // Content should not be visible by default
    expect(queryByText("Content 1")).toBeNull();
    expect(queryByText("Content 2")).toBeNull();
  });

  it("expands an item when pressed", () => {
    const { getByText } = render(<Accordion items={mockItems} />);

    fireEvent.press(getByText("Item 1"));

    expect(getByText("Content 1")).toBeTruthy();
  });

  it("triggers haptics on toggle", () => {
    const { getByText } = render(<Accordion items={mockItems} />);

    fireEvent.press(getByText("Item 1"));

    expect(haptics.light).toHaveBeenCalled();
  });

  it("applies correct accessibility role and state", () => {
    const { getByText } = render(<Accordion items={mockItems} />);

    const header = getByText("Item 1").parent?.parent; // Find the TouchableOpacity

    expect(header?.props.accessibilityRole).toBe("button");
    expect(header?.props.accessibilityState.expanded).toBe(false);

    fireEvent.press(getByText("Item 1"));

    expect(header?.props.accessibilityState.expanded).toBe(true);
  });

  it("handles multiple expansions if multiple prop is true", () => {
    const { getByText } = render(<Accordion items={mockItems} multiple={true} />);

    fireEvent.press(getByText("Item 1"));
    fireEvent.press(getByText("Item 2"));

    expect(getByText("Content 1")).toBeTruthy();
    expect(getByText("Content 2")).toBeTruthy();
  });

  it("collapses other items if multiple prop is false", () => {
    const { getByText, queryByText } = render(<Accordion items={mockItems} multiple={false} />);

    fireEvent.press(getByText("Item 1"));
    expect(getByText("Content 1")).toBeTruthy();

    fireEvent.press(getByText("Item 2"));
    expect(queryByText("Content 1")).toBeNull();
    expect(getByText("Content 2")).toBeTruthy();
  });

  it("calls onItemToggle when an item is toggled", () => {
    const onItemToggle = jest.fn();
    const { getByText } = render(<Accordion items={mockItems} onItemToggle={onItemToggle} />);

    fireEvent.press(getByText("Item 1"));
    expect(onItemToggle).toHaveBeenCalledWith("1", true);

    fireEvent.press(getByText("Item 1"));
    expect(onItemToggle).toHaveBeenCalledWith("1", false);
  });
});
