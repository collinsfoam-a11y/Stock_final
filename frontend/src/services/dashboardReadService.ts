import type {
  ActivityItem,
  DashboardStats,
} from "@/components/supervisor/dashboard/supervisorDashboardShared";
import type { Session } from "@/types";
import { getSessions, getSessionsAnalytics, getSystemStats } from "@/services/api/api";
import { getProjectedSessionStatsRead } from "@/services/control-plane/countLineControlPlane";
import { controlPlaneEventBus } from "@/services/control-plane/controlPlaneEventBus";
import { getProjectedSessionsRead } from "@/services/control-plane/sessionControlPlane";

type SessionsAnalyticsPayload = {
  overall?: {
    total_sessions?: number;
    total_items?: number;
    total_variance?: number;
    avg_variance?: number;
    positive_variance?: number;
    negative_variance?: number;
    high_risk_sessions?: number;
    sessions_by_status?: { status: string; count: number }[];
  };
  total_sessions?: number;
};

export type SupervisorDashboardData = {
  sessions: Session[];
  stats: DashboardStats;
  activities: ActivityItem[];
  overlayCount: number;
};

const DEFAULT_STATS: DashboardStats = {
  totalSessions: 0,
  openSessions: 0,
  closedSessions: 0,
  reconciledSessions: 0,
  totalItems: 0,
  totalVariance: 0,
  positiveVariance: 0,
  negativeVariance: 0,
  avgVariancePerSession: 0,
  highRiskSessions: 0,
};

const countByStatus = (rows: { status: string; count: number }[] | undefined) => {
  const counts = new Map<string, number>();
  for (const row of rows || []) {
    const status = String(row?.status || "").toUpperCase();
    if (!status) {
      continue;
    }
    counts.set(status, (counts.get(status) || 0) + Number(row?.count || 0));
  }
  return counts;
};

const toActivity = (session: Session): ActivityItem => ({
  id: session.id,
  type: "session",
  title: `Session ${String(session.status || "").toLowerCase()}`,
  description: `${session.warehouse} - ${session.staff_name || "Unknown"} - ${session.total_items || 0} items`,
  timestamp: new Date(session.started_at),
  status: session.status === "OPEN" ? "info" : session.status === "CLOSED" ? "success" : "warning",
});

const isUnsyncedProjectedSession = (session: Session) =>
  Boolean((session as any)?._projection) &&
  (session as any)?._sync_status !== "synced" &&
  !(session as any)?._server_session_id;

const buildBaseStats = (analytics: SessionsAnalyticsPayload | null | undefined): DashboardStats => {
  const overall = analytics?.overall || {};
  const byStatus = countByStatus(overall.sessions_by_status);
  const totalSessions = Number(analytics?.total_sessions ?? overall.total_sessions ?? 0);

  return {
    totalSessions,
    openSessions: byStatus.get("OPEN") || 0,
    closedSessions: byStatus.get("CLOSED") || 0,
    reconciledSessions: byStatus.get("RECONCILE") || 0,
    totalItems: Number(overall.total_items || 0),
    totalVariance: Number(overall.total_variance || 0),
    positiveVariance: Number(overall.positive_variance || 0),
    negativeVariance: Number(overall.negative_variance || 0),
    avgVariancePerSession: Number(overall.avg_variance || 0),
    highRiskSessions: Number(overall.high_risk_sessions || 0),
  };
};

const applyLocalOverlay = async (base: DashboardStats, sessions: Session[]) => {
  const overlaid = { ...base };
  const overlaySessions = sessions.filter(isUnsyncedProjectedSession);

  for (const session of overlaySessions) {
    overlaid.totalSessions += 1;
    if (session.status === "OPEN") {
      overlaid.openSessions += 1;
    }
    if (session.status === "CLOSED") {
      overlaid.closedSessions += 1;
    }
    if (session.status === "RECONCILE") {
      overlaid.reconciledSessions += 1;
    }

    try {
      const projectedStats = await getProjectedSessionStatsRead(session.id);
      if (projectedStats) {
        overlaid.totalItems += projectedStats.scannedItems;
      }
    } catch {
      // Best-effort local overlay only; backend projection remains authoritative.
    }

    const variance = Number(session.total_variance || 0);
    overlaid.totalVariance += variance;
    overlaid.positiveVariance += Math.max(variance, 0);
    overlaid.negativeVariance += Math.min(variance, 0);
    if (Math.abs(variance) > 1000) {
      overlaid.highRiskSessions += 1;
    }
  }

  overlaid.avgVariancePerSession =
    overlaid.totalSessions > 0 ? overlaid.totalVariance / overlaid.totalSessions : 0;

  return {
    stats: overlaid,
    overlayCount: overlaySessions.length,
  };
};

export const dashboardReadService = {
  async getSupervisorDashboardData(): Promise<SupervisorDashboardData> {
    const [sessionsPage, analyticsRes] = await Promise.all([
      getSessions(1, 100),
      getSessionsAnalytics(),
    ]);
    const sessions = sessionsPage.items || [];
    const baseStats = buildBaseStats(analyticsRes?.data);
    const overlay = await applyLocalOverlay(baseStats, sessions);

    return {
      sessions,
      stats: overlay.stats,
      activities: sessions.slice(0, 10).map(toActivity),
      overlayCount: overlay.overlayCount,
    };
  },

  async getAdminBusinessSnapshot(): Promise<{
    systemStats: any;
    sessionsAnalytics: any;
    overlayCount: number;
  }> {
    const [systemStats, sessionsAnalytics, projectedSessions] = await Promise.all([
      getSystemStats(),
      getSessionsAnalytics(),
      getProjectedSessionsRead().catch(() => [] as Session[]),
    ]);

    return {
      systemStats: systemStats?.data ?? null,
      sessionsAnalytics: sessionsAnalytics?.data ?? null,
      overlayCount: projectedSessions.filter(isUnsyncedProjectedSession).length,
    };
  },

  subscribeToDashboardInvalidation(callback: () => void): () => void {
    const unsubscribers = [
      controlPlaneEventBus.subscribe("session.changed", callback),
      controlPlaneEventBus.subscribe("inventory.changed", callback),
      controlPlaneEventBus.subscribe("review.changed", callback),
      controlPlaneEventBus.subscribe("sync.completed", callback),
    ];
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  },

  getEmptyStats(): DashboardStats {
    return { ...DEFAULT_STATS };
  },
};
