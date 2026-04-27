/**
 * Admin Dashboard Web v2.0 - Aurora Design System
 *
 * Owns dashboard state, data loading, tab routing, and report generation.
 * Shared Aurora styles/helpers live in dashboardWebShared.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  attemptAutoFixDiagnosis,
  createExportSchedule,
  deleteExportSchedule,
  downloadExportResult,
  generateReport,
  getAvailableReports,
  getDiagnosisHealth,
  getExportResults,
  getExportSchedules,
  getMetricsHealth,
  getMetricsStats,
  getServicesStatus,
  getSessions,
  getSessionsAnalytics,
  getSystemHealthScore,
  getSystemIssues,
  getSystemStats,
  startService,
  stopService,
  triggerExportSchedule,
  updateExportSchedule,
} from "../../src/services/api";
import type {
  ExportResultRecord,
  ExportScheduleFormat,
  ExportScheduleFrequency,
  ExportScheduleRecord,
  ExportScheduleType,
} from "../../src/services/api";
import { GlassCard } from "../../src/components/ui/GlassCard";
import { ScreenContainer } from "../../src/components/ui/ScreenContainer";
import {
  DashboardAnalyticsPanel,
  DashboardDiagnosisPanel,
  DashboardMonitoringPanel,
  DashboardOverviewPanel,
  DashboardReportsPanel,
  DashboardTabBar,
} from "../../src/components/admin/dashboard/DashboardPanels";
import { DashboardReportModal } from "../../src/components/admin/dashboard/DashboardReportModal";
import {
  DASHBOARD_IS_WEB,
  DASHBOARD_TABS,
  DashboardTab,
  dashboardWebStyles as styles,
  isDashboardTab,
  normalizeDashboardMetrics,
  prepareSessionChartData,
  prepareStatusChartData,
  toYMD,
} from "../../src/components/admin/dashboard/dashboardWebShared";
import { ADMIN_NAV_GROUPS } from "../../src/components/navigation/adminNavShared";
import { useSettingsStore } from "../../src/store/settingsStore";

const DEFAULT_SCHEDULE_DRAFT: {
  email_recipients: string;
  export_type: ExportScheduleType;
  format: ExportScheduleFormat;
  frequency: ExportScheduleFrequency;
  name: string;
} = {
  name: "",
  export_type: "variance_report",
  frequency: "daily",
  format: "csv",
  email_recipients: "",
};

export default function DashboardWeb() {
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);

  const [activeTab, setActiveTab] = useState<DashboardTab>(isDashboardTab(tab) ? tab : "overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [, setLastUpdate] = useState<Date>(new Date());
  const [serviceActionLoading, setServiceActionLoading] = useState<string | null>(null);

  const [systemStats, setSystemStats] = useState<any>(null);
  const [servicesStatus, setServicesStatus] = useState<any>(null);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [issues, setIssues] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [schedules, setSchedules] = useState<ExportScheduleRecord[]>([]);
  const [exportResults, setExportResults] = useState<ExportResultRecord[]>([]);
  const [reportOpsLoading, setReportOpsLoading] = useState(false);
  const [scheduleActionLoading, setScheduleActionLoading] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState(DEFAULT_SCHEDULE_DRAFT);
  const [sessionsAnalytics, setSessionsAnalytics] = useState<any>(null);
  const [diagnosisHealth, setDiagnosisHealth] = useState<any>(null);

  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [reportFormat, setReportFormat] = useState<"excel" | "csv" | "json">("excel");
  const [reportDateRange, setReportDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    end: new Date(),
  });

  const [analyticsDateRange, setAnalyticsDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    end: new Date(),
  });

  const resetScheduleDraft = useCallback(() => {
    setEditingScheduleId(null);
    setScheduleDraft(DEFAULT_SCHEDULE_DRAFT);
  }, []);

  const fetchAvailableReports = useCallback(async () => {
    if (offlineMode) {
      setReports([]);
      return;
    }

    setReportsLoading(true);
    try {
      const response = await getAvailableReports();
      setReports(response?.data?.reports || []);
    } catch {
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, [offlineMode]);

  const fetchReportOperations = useCallback(async () => {
    if (offlineMode) {
      setSchedules([]);
      setExportResults([]);
      return;
    }

    setReportOpsLoading(true);
    try {
      const [nextSchedules, nextResults] = await Promise.all([
        getExportSchedules(),
        getExportResults(undefined, undefined, 1, 10),
      ]);
      setSchedules(nextSchedules);
      setExportResults(nextResults);
    } catch (error) {
      console.error("Failed to load export schedules/results:", error);
      setSchedules([]);
      setExportResults([]);
    } finally {
      setReportOpsLoading(false);
    }
  }, [offlineMode]);

  const loadDashboardData = useCallback(
    async (isRefresh = false) => {
      if (offlineMode) {
        if (isRefresh) setRefreshing(true);
        setServicesStatus(null);
        setSystemStats(null);
        setHealthScore(null);
        setIssues([]);
        setMetrics(null);
        setReports([]);
        setSessionsAnalytics(null);
        setDiagnosisHealth(null);
        setSchedules([]);
        setExportResults([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        if (isRefresh) setRefreshing(true);

        const [
          servicesRes,
          statsRes,
          metricsRes,
          _healthRes,
          _reportsRes,
          issuesRes,
          healthScoreRes,
          _sessionsRes,
          analyticsRes,
          diagnosisHealthRes,
        ] = await Promise.allSettled([
          getServicesStatus().catch(() => ({ data: null })),
          getSystemStats().catch(() => ({ data: null })),
          getMetricsStats().catch(() => ({ data: null })),
          getMetricsHealth().catch(() => ({ data: null })),
          fetchAvailableReports(),
          getSystemIssues().catch(() => ({ data: { issues: [] } })),
          getSystemHealthScore().catch(() => ({ data: null })),
          getSessions(1, 100).catch(() => ({ data: { sessions: [] } })),
          getSessionsAnalytics().catch(() => ({ data: null })),
          getDiagnosisHealth().catch(() => null),
        ]);

        if (servicesRes.status === "fulfilled") {
          setServicesStatus(servicesRes.value?.data);
        }
        if (statsRes.status === "fulfilled") {
          setSystemStats(statsRes.value?.data);
        }
        if (metricsRes.status === "fulfilled") {
          setMetrics(normalizeDashboardMetrics(metricsRes.value));
        }
        if (issuesRes.status === "fulfilled") {
          setIssues(issuesRes.value?.data?.issues || []);
        }
        if (healthScoreRes.status === "fulfilled") {
          setHealthScore(healthScoreRes.value?.data?.score);
        }
        if (analyticsRes.status === "fulfilled") {
          setSessionsAnalytics(analyticsRes.value?.data);
        }
        if (diagnosisHealthRes.status === "fulfilled") {
          setDiagnosisHealth(diagnosisHealthRes.value);
        }

        setLastUpdate(new Date());
      } catch (error) {
        console.error("Dashboard data load error:", error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchAvailableReports, offlineMode]
  );

  useEffect(() => {
    void loadDashboardData();
    if (offlineMode) {
      return;
    }

    const interval = setInterval(() => loadDashboardData(), 30000);
    return () => clearInterval(interval);
  }, [loadDashboardData, offlineMode]);

  useEffect(() => {
    if (isDashboardTab(tab)) {
      setActiveTab(tab);
    }
  }, [tab]);

  useEffect(() => {
    if (activeTab === "reports" && !loading) {
      if (reports.length === 0 && !reportsLoading) {
        void fetchAvailableReports();
      }
      if (
        (schedules.length === 0 && exportResults.length === 0) ||
        (!reportOpsLoading && refreshing)
      ) {
        void fetchReportOperations();
      }
    }
  }, [
    activeTab,
    exportResults.length,
    fetchAvailableReports,
    fetchReportOperations,
    loading,
    refreshing,
    reportOpsLoading,
    reports.length,
    reportsLoading,
    schedules.length,
  ]);

  const handleTabChange = useCallback(
    (nextTab: DashboardTab) => {
      if (nextTab === activeTab) {
        return;
      }

      setActiveTab(nextTab);
      router.replace({
        pathname: "/admin/dashboard-web",
        params: { tab: nextTab },
      } as any);
    },
    [activeTab, router]
  );

  const adminRouteTools = useMemo(
    () =>
      ADMIN_NAV_GROUPS.flatMap((group) => group.items).filter(
        (item) => item.route !== "/admin/dashboard-web"
      ),
    []
  );

  const recommendedTools = useMemo(() => {
    const suggestions: {
      icon: keyof typeof Ionicons.glyphMap;
      key: string;
      onPress: () => void;
      subtitle: string;
      title: string;
    }[] = [];

    if (issues.length > 0) {
      suggestions.push({
        key: "recommended-diagnosis",
        title: "Fix important issues",
        subtitle: `${issues.length} issue(s) need action from admin`,
        icon: "build",
        onPress: () => handleTabChange("diagnosis"),
      });
    }

    const backendRunning = Boolean(servicesStatus?.backend?.running);
    const frontendRunning = Boolean(servicesStatus?.frontend?.running);
    if (!backendRunning || !frontendRunning || (healthScore ?? 100) < 80) {
      suggestions.push({
        key: "recommended-monitoring",
        title: "Stabilize system health",
        subtitle: "Check service status and recovery metrics",
        icon: "pulse",
        onPress: () => handleTabChange("monitoring"),
      });
    }

    suggestions.push({
      key: "recommended-variances",
      title: "Review count differences",
      subtitle: "Prioritize blocked staff work and recount assignments",
      icon: "alert-circle",
      onPress: () => router.push("/supervisor/variances" as any),
    });

    suggestions.push({
      key: "recommended-help",
      title: "Open help guide",
      subtitle: "Use quick instructions before client handoff",
      icon: "help-circle-outline",
      onPress: () => router.push("/help" as any),
    });

    return suggestions;
  }, [healthScore, issues.length, router, servicesStatus, handleTabChange]);

  const handleGenerateReport = async (reportType: string) => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "Report generation requires a live connection.");
      return;
    }

    setGenerating(true);
    try {
      const result = await generateReport(reportType, {
        format: reportFormat,
        startDate: toYMD(reportDateRange.start),
        endDate: toYMD(reportDateRange.end),
      });

      if (result.kind === "json") {
        Alert.alert("Report Ready", `Report "${reportType}" generated successfully.`);
        setShowReportModal(false);
        return;
      }

      if (DASHBOARD_IS_WEB && "blob" in result) {
        if (result.blob.size === 0) {
          Alert.alert("No Data", "No records found for the selected date range.");
          return;
        }

        const url = window.URL.createObjectURL(result.blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", result.fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        setShowReportModal(false);
        return;
      }

      Alert.alert(
        "Download Not Supported",
        "Report download is currently supported in the web dashboard."
      );
      setShowReportModal(false);
    } catch (error) {
      console.error("Report generation failed:", error);
      alert("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadExport = useCallback(async (resultId: string) => {
    try {
      const fileBlob = await downloadExportResult(resultId);

      if (DASHBOARD_IS_WEB && fileBlob instanceof Blob) {
        const url = window.URL.createObjectURL(fileBlob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `scheduled-export-${resultId}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        return;
      }

      Alert.alert(
        "Download Not Supported",
        "Scheduled export download is currently supported in the web dashboard."
      );
    } catch (error) {
      console.error("Failed to download export result:", error);
      Alert.alert("Download Failed", "Unable to download this export result.");
    }
  }, []);

  const handlePrepareSchedule = useCallback((report: any) => {
    const normalizedId = String(report?.id ?? "");
    const nextExportType: ExportScheduleType = normalizedId.includes("variance")
      ? "variance_report"
      : normalizedId.includes("activity")
        ? "activity_logs"
        : normalizedId.includes("count")
          ? "count_lines"
          : "sessions";

    setEditingScheduleId(null);
    setScheduleDraft({
      name: report?.name ? `${report.name} schedule` : "Scheduled export",
      export_type: nextExportType,
      frequency: "daily",
      format: "csv",
      email_recipients: "",
    });
  }, []);

  const handleEditSchedule = useCallback((schedule: ExportScheduleRecord) => {
    setEditingScheduleId(schedule.id);
    setScheduleDraft({
      name: schedule.name,
      export_type: schedule.export_type,
      frequency: schedule.frequency,
      format: schedule.format,
      email_recipients: schedule.email_recipients.join(", "),
    });
  }, []);

  const handleSaveSchedule = useCallback(async () => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "Export schedules require a live backend connection.");
      return;
    }

    if (!scheduleDraft.name.trim()) {
      Alert.alert("Missing Name", "Provide a schedule name before saving.");
      return;
    }

    const payload = {
      name: scheduleDraft.name.trim(),
      export_type: scheduleDraft.export_type,
      frequency: scheduleDraft.frequency,
      format: scheduleDraft.format,
      email_recipients: scheduleDraft.email_recipients
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    };

    try {
      setScheduleActionLoading(editingScheduleId || "create");
      if (editingScheduleId) {
        await updateExportSchedule(editingScheduleId, payload);
      } else {
        await createExportSchedule(payload);
      }

      await fetchReportOperations();
      resetScheduleDraft();
      Alert.alert(
        "Schedule Saved",
        editingScheduleId ? "The export schedule was updated." : "The export schedule was created."
      );
    } catch (error) {
      console.error("Failed to save export schedule:", error);
      Alert.alert("Save Failed", "Unable to save the export schedule.");
    } finally {
      setScheduleActionLoading(null);
    }
  }, [editingScheduleId, fetchReportOperations, offlineMode, resetScheduleDraft, scheduleDraft]);

  const handleToggleSchedule = useCallback(
    async (schedule: ExportScheduleRecord) => {
      try {
        setScheduleActionLoading(schedule.id);
        await updateExportSchedule(schedule.id, {
          enabled: !schedule.enabled,
        });
        await fetchReportOperations();
      } catch (error) {
        console.error("Failed to toggle export schedule:", error);
        Alert.alert("Update Failed", "Unable to update the schedule state.");
      } finally {
        setScheduleActionLoading(null);
      }
    },
    [fetchReportOperations]
  );

  const handleRunSchedule = useCallback(
    async (schedule: ExportScheduleRecord) => {
      try {
        setScheduleActionLoading(schedule.id);
        await triggerExportSchedule(schedule.id);
        await fetchReportOperations();
        Alert.alert("Export Started", `"${schedule.name}" was queued successfully.`);
      } catch (error) {
        console.error("Failed to trigger export schedule:", error);
        Alert.alert("Run Failed", "Unable to run the selected schedule.");
      } finally {
        setScheduleActionLoading(null);
      }
    },
    [fetchReportOperations]
  );

  const handleDeleteSchedule = useCallback(
    (schedule: ExportScheduleRecord) => {
      Alert.alert("Delete Schedule", `Delete "${schedule.name}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setScheduleActionLoading(schedule.id);
              await deleteExportSchedule(schedule.id);
              await fetchReportOperations();
              if (editingScheduleId === schedule.id) {
                resetScheduleDraft();
              }
            } catch (error) {
              console.error("Failed to delete export schedule:", error);
              Alert.alert("Delete Failed", "Unable to remove the selected schedule.");
            } finally {
              setScheduleActionLoading(null);
            }
          },
        },
      ]);
    },
    [editingScheduleId, fetchReportOperations, resetScheduleDraft]
  );

  const handleAutoFix = async (issue: any) => {
    if (offlineMode) {
      Alert.alert("Offline Mode", "Auto-fix actions require a live connection.");
      return;
    }

    try {
      setRefreshing(true);
      const result = await attemptAutoFixDiagnosis({
        error_type: issue.error_type || issue.title || "Exception",
        error_message: issue.error_message || issue.description || "Unknown error",
        context: {
          issue_id: issue.id,
          source: "admin_dashboard",
        },
      });

      if (result.fixed) {
        Alert.alert("Success", "Issue has been automatically resolved.");
        await loadDashboardData(true);
      } else {
        Alert.alert(
          "Failed",
          result.fix_result || result.message || "Could not auto-fix this issue. Please check logs."
        );
      }
    } catch (error) {
      console.error("Auto-fix error:", error);
      Alert.alert("Error", "An error occurred while trying to fix the issue.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleServiceToggle = async (serviceKey: "backend" | "frontend", service: any) => {
    if (offlineMode) {
      Alert.alert(
        "Offline Mode",
        "Service controls are unavailable while offline mode is enabled."
      );
      return;
    }

    try {
      setServiceActionLoading(serviceKey);
      const response = service?.running
        ? await stopService(serviceKey)
        : await startService(serviceKey);

      Alert.alert(
        "Success",
        response?.message || `${serviceKey} ${service?.running ? "stop" : "start"} request sent.`
      );
      await loadDashboardData(true);
    } catch (error: any) {
      Alert.alert(
        "Error",
        error?.message || `Failed to ${service?.running ? "stop" : "start"} ${serviceKey}.`
      );
    } finally {
      setServiceActionLoading(null);
    }
  };

  const adminTools = useMemo(
    () => [
      ...[
        ...recommendedTools,
        {
          key: "monitoring",
          title: "System Monitoring",
          subtitle: "Service controls and performance status",
          icon: "pulse" as const,
          onPress: () => handleTabChange("monitoring"),
        },
        {
          key: "reports",
          title: "Reports",
          subtitle: "Generate files for audit and sharing",
          icon: "document-text" as const,
          onPress: () => handleTabChange("reports"),
        },
        {
          key: "help",
          title: "Help & Support",
          subtitle: "Open quick usage guidance",
          icon: "help-circle-outline" as const,
          onPress: () => router.push("/help" as any),
        },
        ...adminRouteTools.map((item) => ({
          key: item.key,
          title: item.label,
          subtitle: item.subtitle,
          icon: item.icon,
          onPress: () => router.push(item.route as any),
        })),
      ].filter(
        (tool, index, all) => all.findIndex((candidate) => candidate.key === tool.key) === index
      ),
    ],
    [adminRouteTools, handleTabChange, recommendedTools, router]
  );

  const sessionChartData = prepareSessionChartData(sessionsAnalytics);
  const statusChartData = prepareStatusChartData(systemStats);

  return (
    <ScreenContainer
      backgroundType="solid"
      auroraVariant="primary"
      auroraIntensity="medium"
      header={{
        title: "Admin Dashboard",
        subtitle: "Simple control center for daily operations",
        showLogoutButton: true,
        showBackButton: false,
        rightAction: {
          icon: refreshing ? "sync" : "refresh",
          onPress: () => loadDashboardData(true),
        },
      }}
      loading={loading}
      loadingText="Loading Dashboard..."
      noPadding
    >
      <View style={styles.container}>
        <DashboardTabBar
          activeTab={activeTab}
          onChangeTab={handleTabChange}
          styles={styles}
          tabs={DASHBOARD_TABS}
        />

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadDashboardData(true)} />
          }
        >
          {offlineMode && (
            <GlassCard style={styles.offlineNotice}>
              <Text style={styles.offlineNoticeTitle}>Admin dashboard is in offline mode</Text>
              <Text style={styles.offlineNoticeBody}>
                Monitoring, reports, diagnosis, and service controls require a live backend
                connection. Reconnect to refresh this dashboard.
              </Text>
            </GlassCard>
          )}

          {activeTab === "overview" && (
            <DashboardOverviewPanel
              adminTools={adminTools}
              healthScore={healthScore}
              issues={issues}
              servicesStatus={servicesStatus}
              sessionChartData={sessionChartData}
              statusChartData={statusChartData}
              styles={styles}
              systemStats={systemStats}
            />
          )}

          {activeTab === "monitoring" && (
            <DashboardMonitoringPanel
              metrics={metrics}
              onServiceToggle={handleServiceToggle}
              serviceActionLoading={serviceActionLoading}
              servicesStatus={servicesStatus}
              styles={styles}
            />
          )}

          {activeTab === "reports" && (
            <DashboardReportsPanel
              editingScheduleId={editingScheduleId}
              exportResults={exportResults}
              onCancelScheduleEdit={resetScheduleDraft}
              onChangeScheduleDraft={setScheduleDraft}
              onDeleteSchedule={handleDeleteSchedule}
              onDownloadExportResult={handleDownloadExport}
              onEditSchedule={handleEditSchedule}
              onOpenReport={(reportId) => {
                setSelectedReport(reportId);
                setShowReportModal(true);
              }}
              onPrepareSchedule={handlePrepareSchedule}
              onRunSchedule={handleRunSchedule}
              onSaveSchedule={handleSaveSchedule}
              onToggleSchedule={handleToggleSchedule}
              reportOpsLoading={reportOpsLoading}
              reports={reports}
              reportsLoading={reportsLoading}
              scheduleActionLoading={scheduleActionLoading}
              scheduleDraft={scheduleDraft}
              schedules={schedules}
              styles={styles}
            />
          )}

          {activeTab === "analytics" && (
            <DashboardAnalyticsPanel
              analyticsDateRange={analyticsDateRange}
              onChangeDateRange={setAnalyticsDateRange}
              sessionChartData={sessionChartData}
              styles={styles}
            />
          )}

          {activeTab === "diagnosis" && (
            <DashboardDiagnosisPanel
              diagnosisHealth={diagnosisHealth}
              onAutoFix={handleAutoFix}
              styles={styles}
            />
          )}
        </ScrollView>

        <DashboardReportModal
          generating={generating}
          onClose={() => setShowReportModal(false)}
          onConfirm={() => {
            if (selectedReport) {
              handleGenerateReport(selectedReport);
            }
          }}
          onReportDateRangeChange={setReportDateRange}
          onReportFormatChange={setReportFormat}
          reportDateRange={reportDateRange}
          reportFormat={reportFormat}
          selectedReport={selectedReport}
          styles={styles}
          visible={showReportModal}
        />
      </View>
    </ScreenContainer>
  );
}
