import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import NotificationsScreen from "../notifications";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockFetchNotifications = jest.fn();
const mockMarkAsRead = jest.fn(async () => undefined);
const mockMarkAllAsRead = jest.fn(async () => undefined);
const mockGetCountLineById = jest.fn();
const mockGetRecountRequest = jest.fn();

let mockNotifications: any[] = [];

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

jest.mock("../../src/store/notificationStore", () => ({
  useNotificationStore: () => ({
    notifications: mockNotifications,
    unreadCount: mockNotifications.filter((item) => !item.read).length,
    isLoading: false,
    fetchNotifications: mockFetchNotifications,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
  }),
}));

jest.mock("../../src/services/api/api", () => ({
  getCountLineById: (...args: unknown[]) => mockGetCountLineById(...args),
  getRecountRequest: (...args: unknown[]) => mockGetRecountRequest(...args),
}));

jest.mock("../../src/components/ui/ModernHeader", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text, TouchableOpacity, View } = require("react-native");
  function MockModernHeader({
    title,
    onBackPress,
  }: {
    title: string;
    onBackPress?: () => void;
  }) {
    return React.createElement(
      View,
      null,
      React.createElement(Text, null, title),
      React.createElement(TouchableOpacity, { onPress: onBackPress }, null),
    );
  }

  return MockModernHeader;
});

jest.mock("../../src/components/ui/ModernCard", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  function MockModernCard({ children }: { children: React.ReactNode }) {
    return React.createElement(View, null, children);
  }

  return MockModernCard;
});

jest.mock("@expo/vector-icons/Ionicons", () => "Ionicons");

describe("NotificationsScreen routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotifications = [];
  });

  it("routes recount notifications to supervisor variance details", async () => {
    mockNotifications = [
      {
        _id: "notif-1",
        type: "recount_completed",
        title: "Recount Completed",
        message: "Recount finished",
        read: false,
        created_at: "2026-04-27T10:00:00Z",
        action_url: "/recount/recount-1",
      },
    ];
    mockGetRecountRequest.mockResolvedValue({
      id: "recount-1",
      item_code: "ITEM-42",
    });

    const { getByText } = render(<NotificationsScreen />);

    fireEvent.press(getByText("Recount Completed"));

    await waitFor(() => {
      expect(mockMarkAsRead).toHaveBeenCalledWith("notif-1");
      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/supervisor/variance-details",
        params: { itemCode: "ITEM-42" },
      });
    });
  });

  it("routes session reminders to supervisor session detail when a session id is present", async () => {
    mockNotifications = [
      {
        _id: "notif-2",
        type: "session_reminder",
        title: "Session Reminder",
        message: "Review session status",
        read: false,
        created_at: "2026-04-27T11:00:00Z",
        metadata: {
          session_id: "session-9",
        },
      },
    ];

    const { getByText } = render(<NotificationsScreen />);

    fireEvent.press(getByText("Session Reminder"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/supervisor/session/[id]",
        params: { id: "session-9" },
      });
    });
  });
});
