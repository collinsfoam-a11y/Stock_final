import {
  getRealtimeDashboardConnectionState,
  shouldRefreshRealtimeDashboard,
} from "@/components/admin/realtime-dashboard/realtimeDashboardLive";

describe("realtimeDashboardLive", () => {
  it("refreshes the dashboard for dashboard refresh websocket events", () => {
    expect(
      shouldRefreshRealtimeDashboard({
        type: "dashboard_refresh_requested",
        payload: { event: "count_line_created" },
      }),
    ).toBe(true);
  });

  it("ignores unrelated websocket events", () => {
    expect(
      shouldRefreshRealtimeDashboard({
        type: "session_update",
        payload: { status: "ACTIVE" },
      }),
    ).toBe(false);
  });

  it("returns an offline state when offline mode is enabled", () => {
    expect(
      getRealtimeDashboardConnectionState({
        autoRefresh: true,
        isConnected: true,
        offlineMode: true,
      }),
    ).toEqual(
      expect.objectContaining({
        label: "Offline",
        tone: "muted",
      }),
    );
  });

  it("returns a live state when auto refresh is enabled and websocket is connected", () => {
    expect(
      getRealtimeDashboardConnectionState({
        autoRefresh: true,
        isConnected: true,
        offlineMode: false,
      }),
    ).toEqual(
      expect.objectContaining({
        label: "Live",
        tone: "success",
      }),
    );
  });

  it("returns a reconnecting state when auto refresh is enabled but websocket is disconnected", () => {
    expect(
      getRealtimeDashboardConnectionState({
        autoRefresh: true,
        isConnected: false,
        offlineMode: false,
      }),
    ).toEqual(
      expect.objectContaining({
        label: "Reconnecting",
        tone: "warning",
      }),
    );
  });
});
