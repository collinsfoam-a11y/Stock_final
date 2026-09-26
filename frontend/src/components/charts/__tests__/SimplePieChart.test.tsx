import React from "react";
import { render } from "@testing-library/react-native";
import { SimplePieChart } from "../SimplePieChart";

describe("SimplePieChart", () => {
  const mockData = [
    { label: "Category A", value: 60, color: "#FF0000" },
    { label: "Category B", value: 40, color: "#00FF00" },
  ];

  it("renders empty state with summary accessibility label when data is empty", () => {
    const { getByLabelText } = render(
      <SimplePieChart data={[]} title="Inventory Distribution" />
    );
    const container = getByLabelText("Inventory Distribution: No data available");
    expect(container).toBeTruthy();
    expect(container.props.accessibilityRole).toBe("summary");
  });

  it("renders chart with computed summary accessibility label for populated data", () => {
    const { getByLabelText } = render(
      <SimplePieChart data={mockData} title="Sales Breakdown" />
    );
    const expectedSummary =
      "Sales Breakdown. Pie chart summary. Total: 100. Breakdown: Category A 60 (60.0%), Category B 40 (40.0%)";
    const chartSummary = getByLabelText(expectedSummary);
    expect(chartSummary).toBeTruthy();
    expect(chartSummary.props.accessibilityRole).toBe("summary");
  });

  it("renders legend items with clear accessible text attributes", () => {
    const { getByLabelText } = render(
      <SimplePieChart data={mockData} title="Sales Breakdown" />
    );
    const legendItemA = getByLabelText("Category A: 60 (60.0%)");
    const legendItemB = getByLabelText("Category B: 40 (40.0%)");

    expect(legendItemA).toBeTruthy();
    expect(legendItemA.props.accessibilityRole).toBe("text");
    expect(legendItemB).toBeTruthy();
    expect(legendItemB.props.accessibilityRole).toBe("text");
  });
});
