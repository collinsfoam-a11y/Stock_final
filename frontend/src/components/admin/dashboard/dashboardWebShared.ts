import { Dimensions, Platform, StyleSheet } from "react-native";

import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const DASHBOARD_IS_WEB = Platform.OS === "web";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const normalizeDashboardMetrics = (payload: unknown) => {
  const response = asRecord(payload);
  const stats = response.data ? asRecord(response.data) : response;
  if (Object.keys(stats).length === 0) return null;

  const services = asRecord(stats.services);
  const requests = asRecord(services.requests);
  const performance = asRecord(services.performance);
  const uptime = asRecord(services.uptime);

  const totalRequests = Number(requests.total || 0);
  const uptimeSeconds = Number(uptime.seconds || 0);
  const rawErrorRate = Number(requests.error_rate || 0);
  const hasRequestMetrics = Object.keys(requests).length > 0 || Object.keys(performance).length > 0;

  return {
    ...stats,
    request_metrics: hasRequestMetrics
      ? {
          avg_response_time: Number(performance.avg_response_time || 0),
          requests_per_minute:
            uptimeSeconds > 0
              ? totalRequests / Math.max(uptimeSeconds / 60, 1 / 60)
              : totalRequests,
          error_rate: rawErrorRate > 1 ? rawErrorRate / 100 : rawErrorRate,
          total_requests: totalRequests,
        }
      : null,
  };
};

export type DashboardTab = "overview" | "monitoring" | "reports" | "analytics" | "diagnosis";

export const DASHBOARD_TABS: DashboardTab[] = [
  "overview",
  "monitoring",
  "reports",
  "analytics",
  "diagnosis",
];

export const isDashboardTab = (value: unknown): value is DashboardTab =>
  typeof value === "string" && DASHBOARD_TABS.includes(value as DashboardTab);

export const toYMD = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const prepareSessionChartData = (sessionsAnalytics: any) => {
  if (
    !sessionsAnalytics?.sessions_by_date ||
    Object.keys(sessionsAnalytics.sessions_by_date).length === 0
  ) {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return days.map((day) => ({
      x: day,
      y: 0,
    }));
  }

  const sortedDates = Object.keys(sessionsAnalytics.sessions_by_date).sort();
  const last7Dates = sortedDates.slice(-7);

  return last7Dates.map((date) => {
    const count = sessionsAnalytics.sessions_by_date[date];
    const dateObj = new Date(date);
    const label = dateObj.toLocaleDateString(undefined, { weekday: "short" });
    return {
      x: label,
      y: count,
    };
  });
};

export const prepareStatusChartData = (systemStats: any, uiTokens: ThemeTokens) => {
  if (!systemStats) return [];

  return [
    {
      label: "Active",
      value: systemStats.active_sessions || 0,
      color: uiTokens.colors.success,
    },
    {
      label: "Idle",
      value: (systemStats.total_sessions || 0) - (systemStats.active_sessions || 0),
      color: uiTokens.colors.textMuted,
    },
  ];
};

const createDashboardStyleBridge = (uiTokens: ThemeTokens) => ({
  colors: {
    background: {
      tertiary: uiTokens.colors.surfaceElevated,
    },
    border: {
      light: uiTokens.colors.border,
      medium: uiTokens.colors.border,
    },
    error: {
      500: uiTokens.colors.error,
    },
    primary: {
      400: uiTokens.colors.accent,
      500: uiTokens.colors.accent,
    },
    success: {
      500: uiTokens.colors.success,
    },
    text: {
      primary: uiTokens.colors.textPrimary,
      secondary: uiTokens.colors.textSecondary,
    },
  },
  glass: {
    medium: {
      backgroundColor: uiTokens.colors.surfaceElevated,
    },
  },
});

type DashboardStyleBridge = ReturnType<typeof createDashboardStyleBridge>;

const createDashboardTypography = (dashboardTheme: DashboardStyleBridge) => ({
  h1: {
    fontSize: 32,
    fontWeight: "800" as const,
    color: dashboardTheme.colors.text.primary,
  },
  h2: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: dashboardTheme.colors.text.primary,
  },
  h3: {
    fontSize: 20,
    fontWeight: "600" as const,
    color: dashboardTheme.colors.text.primary,
  },
  body: {
    fontSize: 16,
    color: dashboardTheme.colors.text.secondary,
  },
  bodyStrong: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: dashboardTheme.colors.text.primary,
  },
  small: {
    fontSize: 14,
    color: dashboardTheme.colors.text.secondary,
  },
  label: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: dashboardTheme.colors.text.secondary,
  },
});

export const createDashboardWebStyles = (uiTokens: ThemeTokens) => {
  const dashboardTheme = createDashboardStyleBridge(uiTokens);
  const uiSemanticColors = { text: { inverse: uiTokens.colors.surface } };
  const typography = createDashboardTypography(dashboardTheme);

  return StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: uiTokens.spacing.md,
    ...typography.body,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: uiTokens.spacing.lg,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 20,
  },
  headerTitle: {
    ...typography.h1,
    fontSize: 28,
  },
  headerSubtitle: {
    ...typography.body,
    fontSize: 14,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.spacing.sm,
  },
  refreshButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: dashboardTheme.glass.medium.backgroundColor as string,
  },
  logoutButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: uiTokens.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: dashboardTheme.colors.border.light,
    gap: uiTokens.spacing.lg,
  },
  tab: {
    paddingVertical: uiTokens.spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: dashboardTheme.colors.primary[400],
  },
  tabText: {
    ...typography.body,
    fontSize: 16,
  },
  activeTabText: {
    ...typography.bodyStrong,
    color: dashboardTheme.colors.text.primary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: uiTokens.spacing.lg,
    paddingBottom: 40,
  },
  offlineNotice: {
    padding: uiTokens.spacing.md,
    marginBottom: 20,
    gap: 6,
  },
  offlineNoticeTitle: {
    ...typography.bodyStrong,
    fontSize: 15,
  },
  offlineNoticeBody: {
    ...typography.small,
    color: dashboardTheme.colors.text.secondary,
    lineHeight: 18,
  },
  tabContent: {
    gap: uiTokens.spacing.lg,
  },
  quickStatsRow: {
    flexDirection: "row",
    gap: uiTokens.spacing.md,
    flexWrap: "wrap",
  },
  toolsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTokens.spacing.md,
  },
  toolCardWrapper: {
    flex: 1,
    minWidth: 210,
  },
  toolCardPressable: {
    flex: 1,
  },
  toolCard: {
    minHeight: 144,
    padding: uiTokens.spacing.md,
    gap: 10,
  },
  toolIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colorWithAlpha(dashboardTheme.colors.primary[500], 0.12),
    alignItems: "center",
    justifyContent: "center",
  },
  toolTitle: {
    ...typography.bodyStrong,
    fontSize: 16,
  },
  toolSubtitle: {
    ...typography.small,
    lineHeight: 18,
  },
  quickStatCard: {
    flex: 1,
    minWidth: 140,
    padding: uiTokens.spacing.lg,
    alignItems: "center",
  },
  quickStatIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colorWithAlpha(dashboardTheme.colors.primary[500], 0.12),
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  quickStatValue: {
    ...typography.h2,
    marginBottom: 4,
  },
  quickStatLabel: {
    ...typography.small,
  },
  chartsRow: {
    flexDirection: "row",
    gap: uiTokens.spacing.lg,
    flexWrap: "wrap",
  },
  chartCard: {
    flex: 1,
    minWidth: 300,
    padding: uiTokens.spacing.lg,
    minHeight: 300,
  },
  chartTitle: {
    ...typography.h3,
    fontSize: 18,
    marginBottom: uiTokens.spacing.lg,
  },
  sectionCard: {
    padding: 0,
  },
  sectionTitle: {
    ...typography.h3,
    fontSize: 20,
    padding: uiTokens.spacing.lg,
  },
  servicesList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: uiTokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: dashboardTheme.colors.border.light,
  },
  serviceInfo: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  serviceName: {
    ...typography.bodyStrong,
  },
  serviceDetails: {
    flex: 2,
  },
  serviceDetailText: {
    ...typography.small,
  },
  serviceStatusBadge: {
    flex: 1,
    alignItems: "flex-end",
  },
  serviceActions: {
    flex: 1,
    alignItems: "flex-end",
    gap: 10,
  },
  serviceStatusText: {
    ...typography.label,
    fontSize: 12,
  },
  serviceActionButton: {
    minWidth: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  serviceActionButtonSuccess: {
    backgroundColor: dashboardTheme.colors.success[500],
  },
  serviceActionButtonDanger: {
    backgroundColor: dashboardTheme.colors.error[500],
  },
  serviceActionText: {
    ...typography.label,
    color: uiSemanticColors.text.inverse,
    fontSize: 12,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: uiTokens.spacing.md,
    flexWrap: "wrap",
  },
  metricCard: {
    flex: 1,
    padding: uiTokens.spacing.lg,
    minWidth: 150,
  },
  metricLabel: {
    ...typography.small,
    marginBottom: 8,
  },
  metricValue: {
    ...typography.h2,
    fontSize: 24,
  },
  diagnosisCard: {
    padding: uiTokens.spacing.lg,
  },
  diagnosisHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: uiTokens.spacing.lg,
  },
  sectionSubtitle: {
    ...typography.small,
    color: dashboardTheme.colors.text.secondary,
    marginTop: 4,
  },
  healthBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colorWithAlpha(dashboardTheme.colors.primary[500], 0.12),
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: dashboardTheme.colors.primary[500],
  },
  healthScoreText: {
    ...typography.h3,
    color: dashboardTheme.colors.primary[400],
  },
  diagnosisStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 20,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    marginBottom: uiTokens.spacing.lg,
  },
  diagStatItem: {
    alignItems: "center",
  },
  diagStatValue: {
    ...typography.h2,
    fontSize: 28,
  },
  diagStatLabel: {
    ...typography.small,
    marginTop: 4,
  },
  issuesList: {
    gap: uiTokens.spacing.sm,
  },
  issueRow: {
    flexDirection: "row",
    padding: uiTokens.spacing.md,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    alignItems: "center",
    gap: uiTokens.spacing.md,
  },
  issueIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  issueInfo: {
    flex: 1,
  },
  issueTitle: {
    ...typography.bodyStrong,
    fontSize: 16,
  },
  issueDesc: {
    ...typography.small,
    color: dashboardTheme.colors.text.secondary,
    marginTop: 2,
  },
  autoFixButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colorWithAlpha(dashboardTheme.colors.primary[500], 0.12),
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  autoFixText: {
    ...typography.label,
    color: dashboardTheme.colors.primary[400],
    fontSize: 11,
  },
  issueTime: {
    alignItems: "flex-end",
  },
  timeText: {
    ...typography.small,
    fontSize: 10,
    color: dashboardTheme.colors.text.secondary,
  },
  noIssues: {
    alignItems: "center",
    paddingVertical: 40,
    gap: uiTokens.spacing.md,
  },
  noIssuesText: {
    ...typography.body,
    color: dashboardTheme.colors.text.secondary,
  },
  recommendationsCard: {
    marginTop: 20,
    padding: uiTokens.spacing.md,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    gap: 10,
  },
  recommendationsTitle: {
    ...typography.bodyStrong,
    fontSize: 16,
  },
  recommendationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  recommendationText: {
    ...typography.small,
    flex: 1,
    color: dashboardTheme.colors.text.secondary,
  },
  reportsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTokens.spacing.md,
  },
  reportCard: {
    flex: 1,
    minWidth: 300,
    padding: uiTokens.spacing.lg,
  },
  reportHeader: {
    flexDirection: "row",
    gap: uiTokens.spacing.md,
    marginBottom: 20,
  },
  reportIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colorWithAlpha(dashboardTheme.colors.primary[500], 0.12),
    justifyContent: "center",
    alignItems: "center",
  },
  reportInfo: {
    flex: 1,
  },
  reportTitle: {
    ...typography.h3,
    fontSize: 16,
    marginBottom: 4,
  },
  reportDesc: {
    ...typography.small,
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: dashboardTheme.colors.primary[500],
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  generateButtonText: {
    color: uiSemanticColors.text.inverse,
    fontWeight: "600",
  },
  analyticsCard: {
    padding: uiTokens.spacing.lg,
  },
  analyticsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: Math.min(SCREEN_WIDTH * 0.9, 500),
    borderRadius: 24,
    padding: 0,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: uiTokens.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: dashboardTheme.colors.border.light,
  },
  modalTitle: {
    ...typography.h3,
    fontSize: 20,
  },
  modalBody: {
    padding: uiTokens.spacing.lg,
  },
  modalLabel: {
    ...typography.label,
    marginTop: uiTokens.spacing.md,
    marginBottom: 8,
  },
  formatOptions: {
    flexDirection: "row",
    gap: uiTokens.spacing.sm,
    marginTop: 8,
  },
  formatOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border.light,
    backgroundColor: dashboardTheme.colors.background.tertiary,
  },
  formatOptionActive: {
    backgroundColor: dashboardTheme.colors.primary[500],
    borderColor: dashboardTheme.colors.primary[500],
  },
  formatText: {
    color: uiSemanticColors.text.inverse,
    fontWeight: "500",
  },
  modalFooter: {
    flexDirection: "row",
    padding: uiTokens.spacing.lg,
    gap: uiTokens.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: dashboardTheme.colors.border.light,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border.light,
  },
  cancelButtonText: {
    color: dashboardTheme.colors.text.secondary,
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: dashboardTheme.colors.primary[500],
    alignItems: "center",
  },
  confirmButtonText: {
    color: uiSemanticColors.text.inverse,
    fontWeight: "600",
  },
  });
};
