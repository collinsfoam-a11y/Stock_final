import React from "react";
import { render } from "@testing-library/react-native";

import { RealtimeDashboardToolbar } from "@/components/admin/realtime-dashboard/RealtimeDashboardToolbar";

describe("RealtimeDashboardToolbar", () => {
  it("shows ERPNext export labels and operator guidance", () => {
    const { getByText } = render(
      <RealtimeDashboardToolbar
        autoRefresh
        connectionState={{ label: "Live", tone: "success" }}
        onExportCSV={() => {}}
        onExportXLSX={() => {}}
        onOpenColumnSettings={() => {}}
        onToggleAutoRefresh={() => {}}
        onToggleVerifiedFilter={() => {}}
        summary={{
          total_records: 10,
          filtered_records: 5,
          aggregations: {},
          generated_at: new Date().toISOString(),
          generation_time_ms: 12,
        }}
        verifiedFilter={null}
      />,
    );

    getByText("ERPNext CSV");
    getByText("ERPNext XLSX");
    getByText("Blank ID inserts new rows. Keep ID to update existing ERPNext records.");
  });
});
