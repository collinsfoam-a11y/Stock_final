/**
 * useNotifications — TanStack Query hooks for notification server state.
 *
 * Replaces the server-state slices of notificationStore (notifications list,
 * unreadCount, isLoading, error, lastFetched) with proper React Query caching.
 * Client-side actions (markAsRead, markAllAsRead, addLocalNotification) are
 * handled as mutations with optimistic cache updates.
 *
 * The legacy Zustand polling loop in notificationStore is superseded by
 * React Query's built-in refetchInterval.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type Notification,
  type NotificationListResponse,
} from "../../services/api/api.notifications";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (unreadOnly: boolean) => ["notifications", "list", { unreadOnly }] as const,
  unreadCount: () => ["notifications", "unreadCount"] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Fetch the full notification list. Polls every 60 s when the window is focused. */
export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: notificationKeys.list(unreadOnly),
    queryFn: () => getNotifications(unreadOnly),
    staleTime: 30_000,          // 30 s — data is still fresh
    refetchInterval: 60_000,    // poll every 60 s (only when window focused by default)
    refetchIntervalInBackground: false,
    select: (data: NotificationListResponse) => data,
  });
}

/** Lightweight poll for the badge count only. Polls every 30 s. */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: getUnreadNotificationCount,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Mark a single notification as read with optimistic update. */
export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => markNotificationAsRead(notificationId),

    onMutate: async (notificationId: string) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });

      // Snapshot previous state for rollback
      const previousList = queryClient.getQueriesData<NotificationListResponse>({
        queryKey: notificationKeys.all,
      });

      // Optimistically mark as read in every cached list variant
      queryClient.setQueriesData<NotificationListResponse>(
        { queryKey: notificationKeys.all },
        (old) => {
          if (!old) return old;
          const updated = old.notifications.map((n) =>
            n._id === notificationId ? { ...n, read: true } : n,
          );
          const unread_count = updated.filter((n) => !n.read).length;
          return { ...old, notifications: updated, unread_count };
        },
      );

      // Also update the standalone count
      queryClient.setQueryData<number>(
        notificationKeys.unreadCount(),
        (old = 0) => Math.max(0, old - 1),
      );

      return { previousList };
    },

    onError: (_err, _id, context) => {
      if (context?.previousList) {
        context.previousList.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

/** Mark all notifications as read with optimistic update. */
export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsAsRead,

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });

      const previousList = queryClient.getQueriesData<NotificationListResponse>({
        queryKey: notificationKeys.all,
      });

      queryClient.setQueriesData<NotificationListResponse>(
        { queryKey: notificationKeys.all },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            notifications: old.notifications.map((n) => ({ ...n, read: true })),
            unread_count: 0,
          };
        },
      );

      queryClient.setQueryData<number>(notificationKeys.unreadCount(), 0);

      return { previousList };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousList) {
        context.previousList.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

/**
 * Inject a locally-generated notification (e.g. from a push handler) directly
 * into the React Query cache without a network round-trip.
 */
export function useAddLocalNotification() {
  const queryClient = useQueryClient();

  return (notification: Notification) => {
    queryClient.setQueriesData<NotificationListResponse>(
      { queryKey: notificationKeys.all },
      (old) => {
        if (!old) return old;
        const unread_count = old.unread_count + (notification.read ? 0 : 1);
        return {
          ...old,
          notifications: [notification, ...old.notifications],
          total: old.total + 1,
          unread_count,
        };
      },
    );

    queryClient.setQueryData<number>(
      notificationKeys.unreadCount(),
      (old = 0) => old + (notification.read ? 0 : 1),
    );
  };
}
