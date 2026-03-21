type DashboardRealtimeMessage = {
  type?: string;
  payload?: Record<string, unknown>;
} | null;

type ConnectionStateInput = {
  autoRefresh: boolean;
  isConnected: boolean;
  offlineMode: boolean;
};

export type DashboardConnectionTone = "success" | "warning" | "muted";

export type DashboardConnectionState = {
  label: string;
  tone: DashboardConnectionTone;
};

export const shouldRefreshRealtimeDashboard = (
  message: DashboardRealtimeMessage,
): boolean => message?.type === "dashboard_refresh_requested";

export const getRealtimeDashboardConnectionState = ({
  autoRefresh,
  isConnected,
  offlineMode,
}: ConnectionStateInput): DashboardConnectionState => {
  if (offlineMode) {
    return { label: "Offline", tone: "muted" };
  }

  if (!autoRefresh) {
    return { label: "Paused", tone: "muted" };
  }

  if (isConnected) {
    return { label: "Live", tone: "success" };
  }

  return { label: "Reconnecting", tone: "warning" };
};
