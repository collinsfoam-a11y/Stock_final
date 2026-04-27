import { Dimensions, Platform, StyleSheet } from "react-native";

import { auroraTheme } from "@/theme/auroraTheme";

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
  const hasRequestMetrics =
    Object.keys(requests).length > 0 || Object.keys(performance).length > 0;

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

export type DashboardTab =
  | "overview"
  | "monitoring"
  | "reports"
  | "analytics"
  | "diagnosis";

export const DASHBOARD_TABS: DashboardTab[] = [
  "overview",
  "monitoring",
  "reports",
  "analytics",
  "diagnosis",
];

export const isDashboardTab = (value: unknown): value is DashboardTab =>
  typeof value === "string" &&
  DASHBOARD_TABS.includes(value as DashboardTab);

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

export const prepareStatusChartData = (systemStats: any) => {
  if (!systemStats) return [];

  return [
    {
      label: "Active",
      value: systemStats.active_sessions || 0,
      color: auroraTheme.colors.success[500],
    },
    {
      label: "Idle",
      value:
        (systemStats.total_sessions || 0) - (systemStats.active_sessions || 0),
      color: auroraTheme.colors.neutral[400],
    },
  ];
};

const typography = {
  h1: {
    fontFamily: auroraTheme.typography.fontFamily.display,
    fontSize: auroraTheme.typography.fontSize["4xl"],
    fontWeight: "800" as const,
    color: auroraTheme.colors.text.primary,
  },
  h2: {
    fontFamily: auroraTheme.typography.fontFamily.heading,
    fontSize: auroraTheme.typography.fontSize["2xl"],
    fontWeight: "700" as const,
    color: auroraTheme.colors.text.primary,
  },
  h3: {
    fontFamily: auroraTheme.typography.fontFamily.heading,
    fontSize: auroraTheme.typography.fontSize.xl,
    fontWeight: "600" as const,
    color: auroraTheme.colors.text.primary,
  },
  body: {
    fontFamily: auroraTheme.typography.fontFamily.body,
    fontSize: auroraTheme.typography.fontSize.base,
    color: auroraTheme.colors.text.secondary,
  },
  bodyStrong: {
    fontFamily: auroraTheme.typography.fontFamily.body,
    fontSize: auroraTheme.typography.fontSize.base,
    fontWeight: "600" as const,
    color: auroraTheme.colors.text.primary,
  },
  small: {
    fontFamily: auroraTheme.typography.fontFamily.body,
    fontSize: auroraTheme.typography.fontSize.sm,
    color: auroraTheme.colors.text.tertiary,
  },
  label: {
    fontFamily: auroraTheme.typography.fontFamily.label,
    fontSize: auroraTheme.typography.fontSize.sm,
    fontWeight: "600" as const,
    color: auroraTheme.colors.text.secondary,
  },
};

export const dashboardWebStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    ...typography.body,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
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
    gap: 12,
  },
  refreshButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: auroraTheme.glass.medium.backgroundColor as string,
  },
  logoutButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: auroraTheme.colors.border.light,
    gap: 24,
  },
  tab: {
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: auroraTheme.colors.primary[400],
  },
  tabText: {
    ...typography.body,
    fontSize: 16,
  },
  activeTabText: {
    ...typography.bodyStrong,
    color: auroraTheme.colors.text.primary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 40,
  },
  offlineNotice: {
    padding: 18,
    marginBottom: 20,
    gap: 6,
  },
  offlineNoticeTitle: {
    ...typography.bodyStrong,
    fontSize: 15,
  },
  offlineNoticeBody: {
    ...typography.small,
    color: auroraTheme.colors.text.secondary,
    lineHeight: 18,
  },
  tabContent: {
    gap: 24,
  },
  quickStatsRow: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  toolsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
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
    padding: 18,
    gap: 10,
  },
  toolIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: auroraTheme.colors.primary[500] + "20",
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
    padding: 20,
    alignItems: "center",
  },
  quickStatIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: auroraTheme.colors.primary[500] + "20",
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
    gap: 24,
    flexWrap: "wrap",
  },
  chartCard: {
    flex: 1,
    minWidth: 300,
    padding: 20,
    minHeight: 300,
  },
  chartTitle: {
    ...typography.h3,
    fontSize: 18,
    marginBottom: 24,
  },
  sectionCard: {
    padding: 0,
  },
  sectionTitle: {
    ...typography.h3,
    fontSize: 20,
    padding: 20,
  },
  servicesList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: auroraTheme.colors.border.light,
  },
  serviceInfo: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
    backgroundColor: auroraTheme.colors.success[500],
  },
  serviceActionButtonDanger: {
    backgroundColor: auroraTheme.colors.error[500],
  },
  serviceActionText: {
    ...typography.label,
    color: "#fff",
    fontSize: 12,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  metricCard: {
    flex: 1,
    padding: 20,
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
    padding: 20,
  },
  diagnosisHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  sectionSubtitle: {
    ...typography.small,
    color: auroraTheme.colors.text.secondary,
    marginTop: 4,
  },
  healthBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: auroraTheme.colors.primary[500] + "20",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: auroraTheme.colors.primary[500],
  },
  healthScoreText: {
    ...typography.h3,
    color: auroraTheme.colors.primary[400],
  },
  diagnosisStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 20,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    marginBottom: 24,
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
    gap: 12,
  },
  issueRow: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    alignItems: "center",
    gap: 16,
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
    color: auroraTheme.colors.text.secondary,
    marginTop: 2,
  },
  autoFixButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: auroraTheme.colors.primary[500] + "20",
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  autoFixText: {
    ...typography.label,
    color: auroraTheme.colors.primary[400],
    fontSize: 11,
  },
  issueTime: {
    alignItems: "flex-end",
  },
  timeText: {
    ...typography.small,
    fontSize: 10,
    color: auroraTheme.colors.text.secondary,
  },
  noIssues: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 16,
  },
  noIssuesText: {
    ...typography.body,
    color: auroraTheme.colors.text.secondary,
  },
  recommendationsCard: {
    marginTop: 20,
    padding: 16,
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
    color: auroraTheme.colors.text.secondary,
  },
  reportsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  reportCard: {
    flex: 1,
    minWidth: 300,
    padding: 20,
  },
  reportHeader: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 20,
  },
  reportIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: auroraTheme.colors.primary[500] + "20",
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
  reportOpsHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 6,
  },
  scheduleEditor: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  scheduleLabel: {
    ...typography.label,
    fontSize: 12,
    textTransform: "uppercase",
  },
  scheduleInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.light,
    backgroundColor: auroraTheme.colors.background.blur,
    paddingHorizontal: 14,
    color: auroraTheme.colors.text.primary,
    fontFamily: auroraTheme.typography.fontFamily.body,
  },
  scheduleChoiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  scheduleChoice: {
    flex: 1,
    minWidth: 160,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.light,
    backgroundColor: auroraTheme.colors.background.blur,
    padding: 14,
    gap: 6,
  },
  scheduleChoiceActive: {
    borderColor: auroraTheme.colors.primary[400],
    backgroundColor: auroraTheme.colors.primary[500] + "18",
  },
  scheduleChoiceTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
  },
  scheduleChoiceTitleActive: {
    color: auroraTheme.colors.primary[300],
  },
  scheduleChoiceBody: {
    ...typography.small,
    lineHeight: 18,
  },
  scheduleConfigRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  scheduleConfigColumn: {
    flex: 1,
    minWidth: 220,
    gap: 10,
  },
  schedulePillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  schedulePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.light,
    backgroundColor: auroraTheme.colors.background.blur,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  schedulePillActive: {
    borderColor: auroraTheme.colors.primary[400],
    backgroundColor: auroraTheme.colors.primary[500] + "18",
  },
  schedulePillText: {
    ...typography.small,
  },
  schedulePillTextActive: {
    color: auroraTheme.colors.primary[300],
  },
  scheduleActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  scheduleList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  scheduleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: auroraTheme.colors.border.light,
  },
  scheduleRowInfo: {
    flex: 1,
    minWidth: 260,
    gap: 6,
  },
  scheduleRowTitle: {
    ...typography.bodyStrong,
    fontSize: 15,
  },
  scheduleRowMeta: {
    ...typography.small,
    lineHeight: 18,
  },
  scheduleRowButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "flex-start",
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: auroraTheme.colors.primary[500],
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  generateButtonText: {
    color: "#FFF",
    fontWeight: "600",
  },
  secondaryActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.light,
    backgroundColor: auroraTheme.colors.background.blur,
  },
  secondaryActionButtonText: {
    ...typography.label,
    color: auroraTheme.colors.primary[300],
    fontSize: 12,
  },
  secondaryActionButtonDanger: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  secondaryActionButtonDangerText: {
    ...typography.label,
    color: auroraTheme.colors.error[400],
    fontSize: 12,
  },
  resultRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: auroraTheme.colors.border.light,
  },
  resultInfo: {
    flex: 1,
    minWidth: 240,
    gap: 4,
  },
  analyticsCard: {
    padding: 20,
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
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: auroraTheme.colors.border.light,
  },
  modalTitle: {
    ...typography.h3,
    fontSize: 20,
  },
  modalBody: {
    padding: 20,
  },
  modalLabel: {
    ...typography.label,
    marginTop: 16,
    marginBottom: 8,
  },
  formatOptions: {
    flexDirection: "row",
    gap: 12,
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
    borderColor: auroraTheme.colors.border.light,
    backgroundColor: auroraTheme.colors.background.tertiary,
  },
  formatOptionActive: {
    backgroundColor: auroraTheme.colors.primary[500],
    borderColor: auroraTheme.colors.primary[500],
  },
  formatText: {
    color: "#FFF",
    fontWeight: "500",
  },
  modalFooter: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: auroraTheme.colors.border.light,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.light,
  },
  cancelButtonText: {
    color: auroraTheme.colors.text.secondary,
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: auroraTheme.colors.primary[500],
    alignItems: "center",
  },
  confirmButtonText: {
    color: "#FFF",
    fontWeight: "600",
  },
});
