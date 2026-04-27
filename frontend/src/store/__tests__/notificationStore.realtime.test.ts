/* eslint-disable import/first -- API mocks must be registered before the store module loads */
jest.mock("@/services/api/api", () => ({
  getNotifications: jest.fn(),
  getUnreadNotificationCount: jest.fn(),
  markNotificationAsRead: jest.fn(),
  markAllNotificationsAsRead: jest.fn(),
}));

import { act } from "@testing-library/react-native";

import {
  clearNotificationStore,
  syncRealtimeNotificationMessage,
  useNotificationStore,
} from "../notificationStore";

describe("notificationStore realtime sync", () => {
  beforeEach(async () => {
    await clearNotificationStore();
  });

  it("adds a new unread realtime notification to the top of the list", () => {
    act(() => {
      syncRealtimeNotificationMessage({
        type: "notification",
        notification: {
          _id: "notif-1",
          type: "recount_assigned",
          title: "Recount Requested",
          message: "Please recount item A",
          read: false,
          created_at: "2026-04-27T09:30:00Z",
        },
      });
    });

    const state = useNotificationStore.getState();
    expect(state.unreadCount).toBe(1);
    expect(state.notifications[0]).toEqual(
      expect.objectContaining({
        _id: "notif-1",
        title: "Recount Requested",
      }),
    );
  });

  it("deduplicates realtime notifications by id and preserves the latest read state", () => {
    act(() => {
      syncRealtimeNotificationMessage({
        type: "notification",
        notification: {
          _id: "notif-1",
          type: "count_approved",
          title: "Approved",
          message: "Count approved",
          read: false,
          created_at: "2026-04-27T09:30:00Z",
        },
      });
      syncRealtimeNotificationMessage({
        type: "notification",
        notification: {
          _id: "notif-1",
          type: "count_approved",
          title: "Approved",
          message: "Count approved",
          read: true,
          created_at: "2026-04-27T09:30:00Z",
        },
      });
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.read).toBe(true);
    expect(state.unreadCount).toBe(0);
  });
});
