/**
 * Notification Store - Manages user notifications and unread count
 * Supports FR-M-23: Recount notifications
 */
import { AppState, AppStateStatus, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type Notification,
} from "../services/api/api.notifications";
import { createLogger } from "../services/logging";
import { shouldPollNotifications } from "./notificationPolling";

const log = createLogger("notificationStore");

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
          log.warn("Failed to fetch unread count", { error: String(error) });
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
let pollingInterval: ReturnType<typeof setTimeout> | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let visibilityChangeHandler: (() => void) | null = null;
let currentAppState: AppStateStatus =
  Platform.OS === "web" ? "active" : (AppState.currentState ?? "active");

const fetchUnreadCountIfActive = () => {
  const visibilityState =
    typeof document !== "undefined" ? document.visibilityState : "visible";
  if (!shouldPollNotifications(currentAppState, Platform.OS, visibilityState)) {
    return;
  }

  void useNotificationStore.getState().fetchUnreadCount();
};

const stopNotificationPollingListeners = () => {
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  if (
    visibilityChangeHandler &&
    typeof document !== "undefined" &&
    typeof document.removeEventListener === "function"
  ) {
    document.removeEventListener("visibilitychange", visibilityChangeHandler);
  }

  visibilityChangeHandler = null;
};

const startNotificationPollingListeners = () => {
  stopNotificationPollingListeners();

  if (Platform.OS !== "web") {
    appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
      currentAppState = nextAppState;
      if (shouldPollNotifications(nextAppState, Platform.OS)) {
        fetchUnreadCountIfActive();
      }
    });
    return;
  }

  if (
    typeof document === "undefined" ||
    typeof document.addEventListener !== "function"
  ) {
    return;
  }

  visibilityChangeHandler = () => {
    if (
      shouldPollNotifications(
        currentAppState,
        Platform.OS,
        document.visibilityState,
      )
    ) {
      fetchUnreadCountIfActive();
    }
  };

  document.addEventListener("visibilitychange", visibilityChangeHandler);
};

export const startNotificationPolling = (intervalMs = 30000) => {
  if (pollingInterval) return;

  startNotificationPollingListeners();
  fetchUnreadCountIfActive();

  pollingInterval = setInterval(() => {
    fetchUnreadCountIfActive();
  }, intervalMs);
};

export const stopNotificationPolling = () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  stopNotificationPollingListeners();
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
