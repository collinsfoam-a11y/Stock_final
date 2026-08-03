import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Accordion, AccordionItem } from "../Accordion";
import { haptics } from "@/services/haptics";

// Mock haptics
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

const mockItems: AccordionItem[] = [
  { id: "1", title: "Item 1", content: <Text>Content 1</Text> },
  { id: "2", title: "Item 2", content: <Text>Content 2</Text> },
];

describe("Accordion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly", () => {
    const { getByText } = render(<Accordion items={mockItems} />);
    expect(getByText("Item 1")).toBeTruthy();
    expect(getByText("Item 2")).toBeTruthy();
  });

  it("toggles content and triggers haptics", () => {
    const { getByText, queryByText } = render(<Accordion items={mockItems} />);

    // Initially content should not be visible
    expect(queryByText("Content 1")).toBeNull();

    // Press header
    fireEvent.press(getByText("Item 1"));

    // Content should now be visible
    expect(getByText("Content 1")).toBeTruthy();

    // Haptics should be triggered
    expect(haptics.light).toHaveBeenCalled();
  });

  it("applies correct accessibility attributes", () => {
    const { getByRole } = render(<Accordion items={mockItems} />);
    const header = getByRole("button", { name: "Item 1" });

    expect(header.props.accessibilityState.expanded).toBe(false);

    fireEvent.press(header);

    expect(header.props.accessibilityState.expanded).toBe(true);
  });

  it("hides decorative icons from screen readers", () => {
    const itemsWithIcon: AccordionItem[] = [
      { id: "1", title: "Item with Icon", content: <Text>Content</Text>, icon: "star" },
    ];
    const { UNSAFE_getAllByType } = render(<Accordion items={itemsWithIcon} />);
    const icons = UNSAFE_getAllByType(Ionicons);

    expect(icons.length).toBe(2); // The 'star' icon and the 'chevron-down' icon

    icons.forEach((iconInstance) => {
      expect(iconInstance.props.accessibilityElementsHidden).toBe(true);
      expect(iconInstance.props.importantForAccessibility).toBe("no");
      expect(iconInstance.props["aria-hidden"]).toBe(true);
    });
  });
});
