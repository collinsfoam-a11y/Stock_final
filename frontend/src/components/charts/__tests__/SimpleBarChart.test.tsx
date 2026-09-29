import React from "react";
import { render } from "@testing-library/react-native";
import { SimpleBarChart } from "../SimpleBarChart";

describe("SimpleBarChart", () => {
  it("renders empty state with proper accessibility properties", () => {
    const { getByText, getByLabelText } = render(
      <SimpleBarChart data={[]} title="Weekly Scans" />
    );

    expect(getByText("No data available")).toBeTruthy();
    expect(getByText("Weekly Scans")).toBeTruthy();

    const summaryNode = getByLabelText("Weekly Scans: No data available");
    expect(summaryNode).toBeTruthy();
    expect(summaryNode.props.accessibilityRole).toBe("summary");
  });

  it("renders chart data with narrative summary header and individual bar accessibility props without hiding child nodes", () => {
    const sampleData = [
      { label: "Mon", value: 10 },
      { label: "Tue", value: 25 },
      { label: "Wed", value: 15 },
    ];

    const { getByText, getByLabelText } = render(
      <SimpleBarChart data={sampleData} title="Daily Scans" />
    );

    expect(getByText("Daily Scans")).toBeTruthy();

    const expectedSummaryLabel =
      "Daily Scans, 3 items: Mon: 10, Tue: 25, Wed: 15";
    const headerNode = getByLabelText(expectedSummaryLabel);
    expect(headerNode).toBeTruthy();
    expect(headerNode.props.accessibilityRole).toBe("header");

    const monBar = getByLabelText("Mon: 10");
    expect(monBar).toBeTruthy();
    expect(monBar.props.accessibilityRole).toBe("image");

    const tueBar = getByLabelText("Tue: 25");
    expect(tueBar).toBeTruthy();

    const wedBar = getByLabelText("Wed: 15");
    expect(wedBar).toBeTruthy();
  });
});
