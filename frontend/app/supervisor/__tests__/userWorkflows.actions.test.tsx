import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import * as ReactNative from "react-native";

import UserWorkflowsScreen from "../user-workflows";

const mockPush = jest.fn();
const mockGetRunningWorkflows = jest.fn();

jest.mock("expo-router", () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (callback: () => void | (() => void)) => require("react").useEffect(callback, [callback]),
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock("@/services/api/userWorkflowApi", () => ({
  userWorkflowApi: {
    getRunningWorkflows: (...args: unknown[]) => mockGetRunningWorkflows(...args),
  },
}));

jest.mock("@/components/ui", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text, TouchableOpacity, View } = require("react-native");

  return {
    Chip: ({
      label,
      onPress,
    }: {
      label: string;
      onPress?: () => void;
    }) =>
      React.createElement(
        TouchableOpacity,
        { onPress },
        React.createElement(Text, null, label),
      ),
    GlassCard: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
    ProgressBar: () => React.createElement(View, null),
    ScreenContainer: ({ children, header }: { children: React.ReactNode; header?: { title?: string } }) =>
      React.createElement(
        View,
        null,
        header?.title ? React.createElement(Text, null, header.title) : null,
        children,
      ),
    StatsCard: ({ title, value }: { title: string; value: string | number }) =>
      React.createElement(Text, null, `${title}:${value}`),
    StatusBadge: ({ label }: { label: string }) =>
      React.createElement(Text, null, label),
  };
});

jest.mock("@expo/vector-icons/Ionicons", () => "Ionicons");

describe("UserWorkflowsScreen actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
      width: 430,
      height: 932,
      scale: 3,
      fontScale: 1,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("opens the active session when review work is pending", async () => {
    mockGetRunningWorkflows.mockResolvedValue([
      {
        username: "staff1",
        full_name: "Staff One",
        role: "staff",
        workflow_stage: "AWAITING_REVIEW",
        presence_status: "ONLINE",
        active_session_id: "session-1",
        session_status: "RECONCILE",
        warehouse: "Main",
        rack_id: "R1",
        floor: "F1",
        last_activity: "2026-04-27T10:00:00Z",
        pending_review_since: "2026-04-27T09:45:00Z",
        recount_assigned_at: null,
        open_session_count: 1,
        items_counted: 12,
        reviewed_items: 8,
        total_items: 20,
        progress_percent: 60,
        pending_approvals: 4,
        assigned_recounts: 0,
        total_variance: 3,
        priority_score: 85,
        priority_band: "HIGH",
        next_action: "REVIEW_PENDING",
      },
    ]);

    const { getByText } = render(<UserWorkflowsScreen />);

    await waitFor(() => {
      expect(getByText("Review Pending")).toBeTruthy();
    });

    fireEvent.press(getByText("Review Pending"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/supervisor/session/[id]",
      params: { id: "session-1" },
    });
  });

  it("routes recount queue actions to the supervisor variances screen", async () => {
    mockGetRunningWorkflows.mockResolvedValue([
      {
        username: "staff2",
        full_name: "Staff Two",
        role: "staff",
        workflow_stage: "RECOUNT_QUEUE",
        presence_status: "IDLE",
        active_session_id: null,
        session_status: null,
        warehouse: "Main",
        rack_id: "R4",
        floor: "F2",
        last_activity: "2026-04-27T08:00:00Z",
        pending_review_since: null,
        recount_assigned_at: "2026-04-27T07:30:00Z",
        open_session_count: 0,
        items_counted: 0,
        reviewed_items: 0,
        total_items: 0,
        progress_percent: 0,
        pending_approvals: 0,
        assigned_recounts: 3,
        total_variance: 10,
        priority_score: 92,
        priority_band: "CRITICAL",
        next_action: "HANDLE_RECOUNT",
      },
    ]);

    const { getByText } = render(<UserWorkflowsScreen />);

    await waitFor(() => {
      expect(getByText("Handle Recounts")).toBeTruthy();
    });

    fireEvent.press(getByText("Handle Recounts"));

    expect(mockPush).toHaveBeenCalledWith("/supervisor/variances");
  });
});
