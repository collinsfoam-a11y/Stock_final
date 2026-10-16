import React from "react";
import { render } from "@testing-library/react-native";
import { SimpleLineChart } from "../SimpleLineChart";

describe("SimpleLineChart", () => {
  const sampleData = [
    { x: "Jan", y: 10 },
    { x: "Feb", y: 25 },
    { x: "Mar", y: 15 },
    { x: "Apr", y: 40 },
  ];

  it("renders empty state with accessibility attributes when data is empty", () => {
    const { getByText, getByLabelText } = render(
      <SimpleLineChart data={[]} title="Monthly Activity" />
    );

    expect(getByText("No data available")).toBeTruthy();
    expect(getByText("Monthly Activity")).toBeTruthy();

    const chartSummary = getByLabelText("Monthly Activity. No data available");
    expect(chartSummary.props.accessible).toBe(true);
    expect(chartSummary.props.accessibilityRole).toBe("summary");
  });

  it("renders empty state fallback accessibility label when title is missing", () => {
    const { getByLabelText } = render(<SimpleLineChart data={[]} />);

    const chartSummary = getByLabelText("No data available for line chart");
    expect(chartSummary.props.accessible).toBe(true);
    expect(chartSummary.props.accessibilityRole).toBe("summary");
  });

  it("renders chart with comprehensive accessibility summary when data is present", () => {
    const { getByText, getByLabelText } = render(
      <SimpleLineChart
        data={sampleData}
        title="Stock Trend"
        yAxisLabel="Units"
        xAxisLabel="Months"
      />
    );

    expect(getByText("Stock Trend")).toBeTruthy();
    expect(getByText("Units")).toBeTruthy();
    expect(getByText("Months")).toBeTruthy();

    const chartSummary = getByLabelText(
      "Line chart: Stock Trend. Y-axis: Units. X-axis: Months. 4 data points. Start: Jan = 10. End: Apr = 40. Min: 10, Max: 40"
    );

    expect(chartSummary.props.accessible).toBe(true);
    expect(chartSummary.props.accessibilityRole).toBe("summary");
  });

  it("computes summary correctly without title or optional axis labels", () => {
    const { getByLabelText } = render(<SimpleLineChart data={sampleData} />);

    const chartSummary = getByLabelText(
      "Line chart. 4 data points. Start: Jan = 10. End: Apr = 40. Min: 10, Max: 40"
    );

    expect(chartSummary.props.accessible).toBe(true);
    expect(chartSummary.props.accessibilityRole).toBe("summary");
  });
});
