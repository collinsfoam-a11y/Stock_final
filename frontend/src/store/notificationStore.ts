/**
 * Notification Store - Manages user notifications and unread count
 * Supports FR-M-23: Recount notifications
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type Notification,
} from "../services/api/api";

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;

  // Actions
  fetchNotifications: (unreadOnly?: boolean) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  addLocalNotification: (notification: Notification) => void;
  clearError: () => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, _get) => ({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      lastFetched: null,

      fetchNotifications: async (unreadOnly = false) => {
        set({ isLoading: true, error: null });
        try {
          const response = await getNotifications(unreadOnly);
          set({
            notifications: response.notifications || [],
            unreadCount:
              response.unread_count ??
              (response.notifications || []).filter((n) => !n.read).length,
            isLoading: false,
            lastFetched: Date.now(),
          });
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          set({
            error: err.message || "Failed to fetch notifications",
            isLoading: false,
          });
        }
      },

      fetchUnreadCount: async () => {
        try {
          const count = await getUnreadNotificationCount();
          set({ unreadCount: count });
        } catch (error) {
          // Silent fail for badge count
          console.error("Failed to fetch unread count:", error);
        }
      },

      markAsRead: async (notificationId: string) => {
        try {
          await markNotificationAsRead(notificationId);
          set((state) => ({
            notifications: state.notifications.map((n) =>
              n._id === notificationId ? { ...n, read: true } : n,
            ),
            unreadCount: Math.max(0, state.unreadCount - 1),
          }));
        } catch (error: any) {
          set({ error: error.message || "Failed to mark as read" });
        }
      },

      markAllAsRead: async () => {
        try {
          await markAllNotificationsAsRead();
          set((state) => ({
            notifications: state.notifications.map((n) => ({
              ...n,
              read: true,
            })),
            unreadCount: 0,
          }));
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          set({ error: err.message || "Failed to mark all as read" });
        }
      },

      addLocalNotification: (notification: Notification) => {
        set((state) => ({
          notifications: [notification, ...state.notifications],
          unreadCount: state.unreadCount + (notification.read ? 0 : 1),
        }));
      },

      clearError: () => set({ error: null }),

      reset: () =>
        set({
          notifications: [],
          unreadCount: 0,
          isLoading: false,
          error: null,
          lastFetched: null,
        }),
    }),
    {
      name: "notification-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        notifications: state.notifications.slice(0, 100), // Keep last 100
      }),
    },
  ),
);

// Polling hook for real-time notification updates
let pollingInterval: NodeJS.Timeout | null = null;

export const startNotificationPolling = (intervalMs = 30000) => {
  if (pollingInterval) return;

  const store = useNotificationStore.getState();
  store.fetchUnreadCount();

  pollingInterval = setInterval(() => {
    useNotificationStore.getState().fetchUnreadCount();
  }, intervalMs);
};

export const stopNotificationPolling = () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
};

export const clearNotificationStore = async () => {
  stopNotificationPolling();
  useNotificationStore.getState().reset();
  try {
    await useNotificationStore.persist.clearStorage();
  } catch {
    // Best-effort; ignore storage errors.
  }
};
