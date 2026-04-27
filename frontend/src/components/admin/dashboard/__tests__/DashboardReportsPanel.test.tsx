import type { ReactNode } from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { DashboardReportsPanel } from "../DashboardPanels";

jest.mock("@expo/vector-icons/Ionicons", () => "Ionicons");
jest.mock("react-native-reanimated", () => {
  return {
    __esModule: true,
    default: {
      View: ({ children }: { children: ReactNode }) => children,
    },
    FadeInDown: {
      delay: () => ({
        springify: () => ({}),
      }),
    },
  };
});

jest.mock("@/components/ui/AnimatedPressable", () => ({
  AnimatedPressable: ({
    children,
    onPress,
    disabled,
  }: {
    children: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require("react");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TouchableOpacity } = require("react-native");
    return React.createElement(TouchableOpacity, { onPress, disabled }, children);
  },
}));

jest.mock("@/components/ui/GlassCard", () => ({
  GlassCard: ({ children }: { children: ReactNode }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require("react");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { View } = require("react-native");
    return React.createElement(View, null, children);
  },
}));

jest.mock("@/components/charts/SimpleBarChart", () => ({
  SimpleBarChart: () => null,
}));
jest.mock("@/components/charts/SimpleLineChart", () => ({
  SimpleLineChart: () => null,
}));
jest.mock("@/components/charts/SimplePieChart", () => ({
  SimplePieChart: () => null,
}));
jest.mock("@/components/forms/DateRangePicker", () => ({
  DateRangePicker: () => null,
}));

const styles = new Proxy(
  {},
  {
    get: () => ({}),
  },
) as any;

describe("DashboardReportsPanel", () => {
  it("exposes report scheduling and download callbacks", () => {
    const onOpenReport = jest.fn();
    const onPrepareSchedule = jest.fn();
    const onSaveSchedule = jest.fn();
    const onRunSchedule = jest.fn();
    const onDownloadExportResult = jest.fn();

    const { getByText } = render(
      <DashboardReportsPanel
        editingScheduleId={null}
        exportResults={[
          {
            id: "result-1",
            schedule_name: "Daily Variances",
            format: "csv",
            has_content: true,
            created_at: "2026-04-27T10:00:00Z",
          },
        ]}
        onCancelScheduleEdit={jest.fn()}
        onChangeScheduleDraft={jest.fn()}
        onDeleteSchedule={jest.fn()}
        onDownloadExportResult={onDownloadExportResult}
        onEditSchedule={jest.fn()}
        onOpenReport={onOpenReport}
        onPrepareSchedule={onPrepareSchedule}
        onRunSchedule={onRunSchedule}
        onSaveSchedule={onSaveSchedule}
        onToggleSchedule={jest.fn()}
        reportOpsLoading={false}
        reports={[
          {
            id: "variance_report",
            name: "Variance Report",
            description: "Review stock differences",
          },
        ]}
        reportsLoading={false}
        scheduleActionLoading={null}
        scheduleDraft={{
          name: "Daily Variance Digest",
          export_type: "variance_report",
          frequency: "daily",
          format: "csv",
          email_recipients: "ops@example.com",
        }}
        schedules={[
          {
            id: "schedule-1",
            name: "Daily Variance Digest",
            export_type: "variance_report",
            frequency: "daily",
            format: "csv",
            filters: {},
            email_recipients: ["ops@example.com"],
            enabled: true,
          },
        ]}
        styles={styles}
      />,
    );

    fireEvent.press(getByText("Generate Report"));
    fireEvent.press(getByText("Prepare Schedule"));
    fireEvent.press(getByText("Create Schedule"));
    fireEvent.press(getByText("Run"));
    fireEvent.press(getByText("Download"));

    expect(onOpenReport).toHaveBeenCalledWith("variance_report");
    expect(onPrepareSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ id: "variance_report" }),
    );
    expect(onSaveSchedule).toHaveBeenCalled();
    expect(onRunSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ id: "schedule-1" }),
    );
    expect(onDownloadExportResult).toHaveBeenCalledWith("result-1");
  });
});
