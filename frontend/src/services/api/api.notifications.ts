import api from "../httpClient";

export interface NotificationMetadata {
  count_line_id?: string;
  item_name?: string;
  reason?: string;
  assigned_by?: string;
  approved_by?: string;
  rejected_by?: string;
  session_id?: string | null;
  item_code?: string | null;
  barcode?: string | null;
  assigned_to?: string | null;
}

export interface Notification {
  _id: string;
  id?: string;
  type: string;
  title: string;
  message: string;
  priority?: string;
  action_url?: string | null;
  metadata?: NotificationMetadata;
  read: boolean;
  created_at: string;
  read_at?: string | null;
}

export type NotificationListResponse = {
  notifications: Notification[];
  total: number;
  unread_count: number;
};

export const getNotifications = async (
  unreadOnly: boolean = false,
  limit: number = 50
): Promise<NotificationListResponse> => {
  const response = await api.get<NotificationListResponse>("/api/notifications", {
    params: { unread_only: unreadOnly, limit },
  });
  return response.data;
};

export const getUnreadNotificationCount = async (): Promise<number> => {
  const response = await api.get<{ unread_count: number }>("/api/notifications/unread-count");
  return response.data.unread_count ?? 0;
};

export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  await api.post(`/api/notifications/${encodeURIComponent(notificationId)}/read`);
};

export const markAllNotificationsAsRead = async (): Promise<void> => {
  await api.post("/api/notifications/mark-all-read");
};

export const registerNotificationDevice = async (
  token: string,
  platform: string,
): Promise<void> => {
  await api.post("/api/notifications/devices", { token, platform });
};

export const unregisterNotificationDevice = async (
  token: string,
  platform: string,
): Promise<void> => {
  await api.post("/api/notifications/devices/unregister", { token, platform });
};
