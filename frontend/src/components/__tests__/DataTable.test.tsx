import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { DataTable, TableColumn, TableData } from "../DataTable";
import { haptics } from "@/services/haptics";
import Ionicons from "@expo/vector-icons/Ionicons";

// Mock haptics
jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

// Mock useUiTokens
jest.mock("@/hooks/useUiTokens", () => ({
  useUiTokens: () => ({
    colors: {
      surfaceElevated: "#ffffff",
      surface: "#ffffff",
      border: "#cccccc",
      textPrimary: "#000000",
      textSecondary: "#666666",
      textMuted: "#999999",
      accent: "#007bff",
    },
  }),
}));

describe("DataTable", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const columns: TableColumn[] = [
    { key: "id", label: "ID", sortable: true },
    { key: "name", label: "Name", sortable: true },
    { key: "category", label: "Category", sortable: false },
  ];

  const data: TableData[] = [
    { id: "1", name: "Alpha", category: "Cat A" },
    { id: "2", name: "Beta", category: "Cat B" },
    { id: "3", name: "Gamma", category: "Cat A" },
  ];

  it("renders correctly with columns and data", () => {
    const { getByText } = render(<DataTable columns={columns} data={data} />);

    expect(getByText("ID")).toBeTruthy();
    expect(getByText("Name")).toBeTruthy();
    expect(getByText("Category")).toBeTruthy();

    expect(getByText("Alpha")).toBeTruthy();
    expect(getByText("Beta")).toBeTruthy();
    expect(getByText("Gamma")).toBeTruthy();
  });

  it("triggers haptics and sorts when a sortable column header is pressed", () => {
    const { getByText } = render(<DataTable columns={columns} data={data} sortable={true} />);

    const nameHeader = getByText("Name");
    fireEvent.press(nameHeader);

    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it("triggers haptics and calls onRowPress when a row is pressed", () => {
    const handleRowPress = jest.fn();
    const { getByText } = render(
      <DataTable columns={columns} data={data} onRowPress={handleRowPress} />
    );

    const rowItem = getByText("Alpha");
    fireEvent.press(rowItem);

    expect(handleRowPress).toHaveBeenCalledWith(data[0]);
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });

  it("handles pagination correctly with haptic feedback", () => {
    const { getByLabelText, getByText } = render(
      <DataTable columns={columns} data={data} paginated={true} pageSize={1} />
    );

    expect(getByText("Page 1 of 3")).toBeTruthy();

    const nextPageButton = getByLabelText("Next page");
    fireEvent.press(nextPageButton);

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(getByText("Page 2 of 3")).toBeTruthy();

    const prevPageButton = getByLabelText("Previous page");
    fireEvent.press(prevPageButton);

    expect(haptics.light).toHaveBeenCalledTimes(2);
    expect(getByText("Page 1 of 3")).toBeTruthy();
  });

  it("applies decorative icon properties to internal icons", () => {
    const { UNSAFE_getAllByType } = render(
      <DataTable columns={columns} data={[]} emptyText="No items" />
    );

    const icons = UNSAFE_getAllByType(Ionicons);
    expect(icons.length).toBeGreaterThan(0);

    icons.forEach((icon) => {
      expect(icon.props.accessibilityElementsHidden).toBe(true);
      expect(icon.props.importantForAccessibility).toBe("no");
      expect(icon.props["aria-hidden"]).toBe(true);
    });
  });
});
