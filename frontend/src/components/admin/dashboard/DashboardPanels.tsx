import React from "react";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { GlassCard } from "@/components/ui/GlassCard";
import { SimpleBarChart } from "@/components/charts/SimpleBarChart";
import { SimpleLineChart } from "@/components/charts/SimpleLineChart";
import { SimplePieChart } from "@/components/charts/SimplePieChart";
import { DateRangePicker } from "@/components/forms/DateRangePicker";
import { auroraTheme } from "@/theme/auroraTheme";

type DashboardTab = "overview" | "monitoring" | "reports" | "analytics" | "diagnosis";

interface DashboardTabBarProps {
  activeTab: DashboardTab;
  onChangeTab: (tab: DashboardTab) => void;
  styles: any;
  tabs: DashboardTab[];
}

export function DashboardTabBar({
  activeTab,
  onChangeTab,
  styles,
  tabs,
}: DashboardTabBarProps) {
  return (
    <View style={styles.tabsContainer}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab}
          onPress={() => onChangeTab(tab)}
          style={[styles.tab, activeTab === tab && styles.activeTab]}
          testID={`dashboard-tab-${tab}`}
          accessibilityLabel={`${tab} dashboard tab`}
        >
          <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

interface DashboardOverviewPanelProps {
  adminTools: {
    icon: keyof typeof Ionicons.glyphMap;
    key: string;
    onPress: () => void;
    subtitle: string;
    title: string;
  }[];
  healthScore: number | null;
  issues: any[];
  servicesStatus: any;
  sessionChartData: { x: string; y: number }[];
  statusChartData: { color: string; label: string; value: number }[];
  styles: any;
  systemStats: any;
}

export function DashboardOverviewPanel({
  adminTools,
  healthScore,
  issues,
  servicesStatus,
  sessionChartData,
  statusChartData,
  styles,
  systemStats,
}: DashboardOverviewPanelProps) {
  return (
    <Animated.View
      entering={FadeInDown.delay(200).springify()}
      style={styles.tabContent}
      testID="overview-panel"
    >
      <View style={styles.quickStatsRow}>
        <GlassCard variant="medium" style={styles.quickStatCard}>
          <View style={styles.quickStatIcon}>
            <Ionicons
              name="people"
              size={24}
              color={auroraTheme.colors.primary[400]}
            />
          </View>
          <Text style={styles.quickStatValue}>
            {systemStats?.active_sessions || 0}
          </Text>
          <Text style={styles.quickStatLabel}>Active Sessions</Text>
        </GlassCard>

        <GlassCard variant="medium" style={styles.quickStatCard}>
          <View
            style={[
              styles.quickStatIcon,
              { backgroundColor: auroraTheme.colors.success[500] + "20" },
            ]}
          >
            <Ionicons
              name="shield-checkmark"
              size={24}
              color={auroraTheme.colors.success[500]}
            />
          </View>
          <Text
            style={[
              styles.quickStatValue,
              { color: auroraTheme.colors.success[500] },
            ]}
          >
            {healthScore || 0}%
          </Text>
          <Text style={styles.quickStatLabel}>System Health</Text>
        </GlassCard>

        <GlassCard variant="medium" style={styles.quickStatCard}>
          <View
            style={[
              styles.quickStatIcon,
              { backgroundColor: auroraTheme.colors.secondary[500] + "20" },
            ]}
          >
            <Ionicons
              name="server"
              size={24}
              color={auroraTheme.colors.secondary[500]}
            />
          </View>
          <Text style={styles.quickStatValue}>
            {servicesStatus
              ? Object.values(servicesStatus).filter((service: any) => service.running)
                  .length
              : 0}
            /4
          </Text>
          <Text style={styles.quickStatLabel}>Services Running</Text>
        </GlassCard>

        <GlassCard variant="medium" style={styles.quickStatCard}>
          <View
            style={[
              styles.quickStatIcon,
              { backgroundColor: auroraTheme.colors.warning[500] + "20" },
            ]}
          >
            <Ionicons
              name="warning"
              size={24}
              color={auroraTheme.colors.warning[500]}
            />
          </View>
          <Text
            style={[
              styles.quickStatValue,
              {
                color:
                  issues.length > 0
                    ? auroraTheme.colors.warning[500]
                    : auroraTheme.colors.text.primary,
              },
            ]}
          >
            {issues.length}
          </Text>
          <Text style={styles.quickStatLabel}>Critical Issues</Text>
        </GlassCard>
      </View>

      <View style={styles.toolsGrid}>
        {adminTools.map((tool, index) => (
          <Animated.View
            key={tool.key}
            entering={FadeInDown.delay(120 + index * 40).springify()}
            style={styles.toolCardWrapper}
          >
            <AnimatedPressable
              style={styles.toolCardPressable}
              onPress={tool.onPress}
              testID={`admin-tool-${tool.key}`}
            >
              <GlassCard variant="medium" style={styles.toolCard}>
                <View style={styles.toolIcon}>
                  <Ionicons
                    name={tool.icon}
                    size={22}
                    color={auroraTheme.colors.primary[400]}
                  />
                </View>
                <Text style={styles.toolTitle}>{tool.title}</Text>
                <Text style={styles.toolSubtitle}>{tool.subtitle}</Text>
              </GlassCard>
            </AnimatedPressable>
          </Animated.View>
        ))}
      </View>

      <View style={styles.chartsRow}>
        <GlassCard variant="medium" style={styles.chartCard} intensity={80}>
          <Text style={styles.chartTitle}>Session Activity</Text>
          <SimpleLineChart
            data={sessionChartData}
            color={auroraTheme.colors.primary[400]}
            textColor={auroraTheme.colors.text.secondary}
            gridColor={auroraTheme.colors.border.light}
            axisColor={auroraTheme.colors.border.medium}
            xAxisLabel="Last 7 Days"
          />
        </GlassCard>

        <GlassCard variant="medium" style={styles.chartCard} intensity={80}>
          <Text style={styles.chartTitle}>System Distribution</Text>
          <SimplePieChart data={statusChartData} showLegend={true} />
        </GlassCard>
      </View>
    </Animated.View>
  );
}

interface DashboardMonitoringPanelProps {
  metrics: any;
  onServiceToggle: (serviceKey: "backend" | "frontend", service: any) => void;
  serviceActionLoading: string | null;
  servicesStatus: any;
  styles: any;
}

export function DashboardMonitoringPanel({
  metrics,
  onServiceToggle,
  serviceActionLoading,
  servicesStatus,
  styles,
}: DashboardMonitoringPanelProps) {
  return (
    <Animated.View
      entering={FadeInDown.delay(200).springify()}
      style={styles.tabContent}
      testID="monitoring-panel"
    >
      <GlassCard variant="medium" style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Services Status</Text>
        <View style={styles.servicesList}>
          {servicesStatus &&
            Object.entries(servicesStatus).map(([key, service]: [string, any]) => (
              <View
                key={key}
                style={styles.serviceRow}
                testID={`service-row-${key}`}
              >
                <View style={styles.serviceInfo}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor: service.running
                          ? auroraTheme.colors.success[500]
                          : auroraTheme.colors.error[500],
                      },
                    ]}
                  />
                  <Text style={styles.serviceName}>{key.toUpperCase()}</Text>
                </View>
                <View style={styles.serviceDetails}>
                  <Text style={styles.serviceDetailText}>
                    Port: {service.port || "N/A"}
                  </Text>
                  <Text style={styles.serviceDetailText}>
                    PID: {service.pid || "-"}
                  </Text>
                </View>
                <View style={styles.serviceActions}>
                  <Text
                    style={[
                      styles.serviceStatusText,
                      {
                        color: service.running
                          ? auroraTheme.colors.success[500]
                          : auroraTheme.colors.error[500],
                      },
                    ]}
                  >
                    {service.running ? "Running" : "Stopped"}
                  </Text>
                  {(key === "backend" || key === "frontend") && (
                    <AnimatedPressable
                      style={[
                        styles.serviceActionButton,
                        service.running
                          ? styles.serviceActionButtonDanger
                          : styles.serviceActionButtonSuccess,
                      ]}
                      onPress={() =>
                        onServiceToggle(key as "backend" | "frontend", service)
                      }
                      disabled={serviceActionLoading === key}
                      testID={`service-toggle-${key}`}
                      accessibilityLabel={`${service.running ? "Stop" : "Start"} ${key} service`}
                    >
                      {serviceActionLoading === key ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons
                            name={
                              service.running
                                ? "pause-circle-outline"
                                : "play-circle-outline"
                            }
                            size={14}
                            color="#fff"
                          />
                          <Text style={styles.serviceActionText}>
                            {service.running ? "Stop" : "Start"}
                          </Text>
                        </>
                      )}
                    </AnimatedPressable>
                  )}
                </View>
              </View>
            ))}
        </View>
      </GlassCard>

      {metrics && metrics.request_metrics && (
        <View style={styles.metricsGrid}>
          <GlassCard variant="strong" style={styles.metricCard}>
            <Text style={styles.metricLabel}>Response Time</Text>
            <Text style={styles.metricValue}>
              {metrics.request_metrics.avg_response_time?.toFixed(2) || 0}ms
            </Text>
          </GlassCard>
          <GlassCard variant="strong" style={styles.metricCard}>
            <Text style={styles.metricLabel}>Request Rate</Text>
            <Text style={styles.metricValue}>
              {metrics.request_metrics.requests_per_minute?.toFixed(1) || 0}/min
            </Text>
          </GlassCard>
          <GlassCard variant="strong" style={styles.metricCard}>
            <Text style={styles.metricLabel}>Error Rate</Text>
            <Text
              style={[
                styles.metricValue,
                {
                  color:
                    (metrics.request_metrics.error_rate || 0) > 0.05
                      ? auroraTheme.colors.error[500]
                      : auroraTheme.colors.success[500],
                },
              ]}
            >
              {((metrics.request_metrics.error_rate || 0) * 100).toFixed(2)}%
            </Text>
          </GlassCard>
        </View>
      )}
    </Animated.View>
  );
}

interface DashboardReportsPanelProps {
  onOpenReport: (reportId: string) => void;
  reports: any[];
  reportsLoading: boolean;
  styles: any;
}

export function DashboardReportsPanel({
  onOpenReport,
  reports,
  reportsLoading,
  styles,
}: DashboardReportsPanelProps) {
  return (
    <Animated.View
      entering={FadeInDown.delay(200).springify()}
      style={styles.tabContent}
      testID="reports-panel"
    >
      <View style={styles.reportsGrid}>
        {reportsLoading && reports.length === 0 ? (
          <GlassCard variant="medium" style={styles.reportCard}>
            <View style={styles.noIssues}>
              <ActivityIndicator
                size="large"
                color={auroraTheme.colors.primary[400]}
                testID="reports-loading"
              />
              <Text style={styles.noIssuesText}>Loading reports...</Text>
            </View>
          </GlassCard>
        ) : reports.length === 0 ? (
          <GlassCard variant="medium" style={styles.reportCard}>
            <View style={styles.noIssues}>
              <Ionicons
                name="document-text-outline"
                size={48}
                color={auroraTheme.colors.neutral[300]}
              />
              <Text style={styles.noIssuesText}>No reports available</Text>
            </View>
          </GlassCard>
        ) : (
          reports.map((report, index) => (
            <GlassCard key={index} variant="medium" style={styles.reportCard}>
              <View style={styles.reportHeader}>
                <View style={styles.reportIcon}>
                  <Ionicons
                    name="document-text"
                    size={32}
                    color={auroraTheme.colors.primary[400]}
                  />
                </View>
                <View style={styles.reportInfo}>
                  <Text style={styles.reportTitle}>{report.name}</Text>
                  <Text style={styles.reportDesc}>{report.description}</Text>
                </View>
              </View>
              <AnimatedPressable
                style={styles.generateButton}
                onPress={() => onOpenReport(report.id)}
                testID={`generate-report-${report.id}`}
              >
                <Text style={styles.generateButtonText}>Generate Report</Text>
                <Ionicons name="download-outline" size={18} color="#FFF" />
              </AnimatedPressable>
            </GlassCard>
          ))
        )}
      </View>
    </Animated.View>
  );
}

interface DashboardAnalyticsPanelProps {
  analyticsDateRange: { end: Date; start: Date };
  onChangeDateRange: (next: { end: Date; start: Date }) => void;
  sessionChartData: { x: string; y: number }[];
  styles: any;
}

export function DashboardAnalyticsPanel({
  analyticsDateRange,
  onChangeDateRange,
  sessionChartData,
  styles,
}: DashboardAnalyticsPanelProps) {
  return (
    <Animated.View
      entering={FadeInDown.delay(200).springify()}
      style={styles.tabContent}
    >
      <GlassCard variant="medium" style={styles.analyticsCard}>
        <View style={styles.analyticsHeader}>
          <Text style={styles.sectionTitle}>Performance Analytics</Text>
          <DateRangePicker
            startDate={analyticsDateRange.start}
            endDate={analyticsDateRange.end}
            onStartDateChange={(start) =>
              onChangeDateRange({ ...analyticsDateRange, start })
            }
            onEndDateChange={(end) =>
              onChangeDateRange({ ...analyticsDateRange, end })
            }
          />
        </View>

        <SimpleBarChart
          data={sessionChartData.map((entry) => ({
            label: entry.x,
            value: entry.y,
          }))}
          title="Daily Sessions"
          showValues={true}
        />
      </GlassCard>
    </Animated.View>
  );
}

interface DashboardDiagnosisPanelProps {
  diagnosisHealth: any;
  onAutoFix: (issue: any) => void;
  styles: any;
}

export function DashboardDiagnosisPanel({
  diagnosisHealth,
  onAutoFix,
  styles,
}: DashboardDiagnosisPanelProps) {
  return (
    <Animated.View
      entering={FadeInDown.delay(200).springify()}
      style={styles.tabContent}
      testID="diagnosis-panel"
    >
      <GlassCard variant="medium" style={styles.diagnosisCard}>
        <View style={styles.diagnosisHeader}>
          <View>
            <Text style={styles.sectionTitle}>System Self-Diagnosis</Text>
            <Text style={styles.sectionSubtitle}>
              Automated health checks and issue resolution
            </Text>
          </View>
          <View style={styles.healthBadge}>
            <Text style={styles.healthScoreText}>
              {diagnosisHealth?.health_score || 0}%
            </Text>
          </View>
        </View>

        <View style={styles.diagnosisStats}>
          <View style={styles.diagStatItem}>
            <Text style={styles.diagStatValue}>
              {diagnosisHealth?.total_issues || 0}
            </Text>
            <Text style={styles.diagStatLabel}>Total Issues</Text>
          </View>
          <View style={styles.diagStatItem}>
            <Text
              style={[
                styles.diagStatValue,
                { color: auroraTheme.colors.error[500] },
              ]}
            >
              {diagnosisHealth?.critical_issues || 0}
            </Text>
            <Text style={styles.diagStatLabel}>Critical</Text>
          </View>
          <View style={styles.diagStatItem}>
            <Text
              style={[
                styles.diagStatValue,
                { color: auroraTheme.colors.success[500] },
              ]}
            >
              {diagnosisHealth?.auto_fixable_issues || 0}
            </Text>
            <Text style={styles.diagStatLabel}>Auto-Fixable</Text>
          </View>
        </View>

        <View style={styles.issuesList}>
          {diagnosisHealth?.issues && diagnosisHealth.issues.length > 0 ? (
            diagnosisHealth.issues.map((issue: any, index: number) => (
              <View key={index} style={styles.issueRow}>
                <View
                  style={[
                    styles.issueIcon,
                    {
                      backgroundColor:
                        issue.severity === "critical"
                          ? auroraTheme.colors.error[500] + "20"
                          : auroraTheme.colors.warning[500] + "20",
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      issue.severity === "critical" ? "alert-circle" : "warning"
                    }
                    size={20}
                    color={
                      issue.severity === "critical"
                        ? auroraTheme.colors.error[500]
                        : auroraTheme.colors.warning[500]
                    }
                  />
                </View>
                <View style={styles.issueInfo}>
                  <Text style={styles.issueTitle}>
                    {issue.title || issue.type}
                  </Text>
                  <Text style={styles.issueDesc}>
                    {issue.description || issue.message}
                  </Text>
                  {issue.auto_fix_available && (
                    <TouchableOpacity
                      style={styles.autoFixButton}
                      onPress={() => onAutoFix(issue)}
                    >
                      <Ionicons
                        name="build-outline"
                        size={14}
                        color={auroraTheme.colors.primary[400]}
                      />
                      <Text style={styles.autoFixText}>Auto-Fix Available</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.issueTime}>
                  <Text style={styles.timeText}>
                    {new Date(issue.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.noIssues}>
              <Ionicons
                name="checkmark-circle"
                size={48}
                color={auroraTheme.colors.success[500]}
              />
              <Text style={styles.noIssuesText}>No system issues detected</Text>
            </View>
          )}
        </View>

        {diagnosisHealth?.recommendations?.length > 0 && (
          <View style={styles.recommendationsCard}>
            <Text style={styles.recommendationsTitle}>Recommended Actions</Text>
            {diagnosisHealth.recommendations.map(
              (recommendation: string, index: number) => (
                <View
                  key={`${recommendation}-${index}`}
                  style={styles.recommendationRow}
                >
                  <Ionicons
                    name="arrow-forward-circle"
                    size={16}
                    color={auroraTheme.colors.primary[400]}
                  />
                  <Text style={styles.recommendationText}>{recommendation}</Text>
                </View>
              ),
            )}
          </View>
        )}
      </GlassCard>
    </Animated.View>
  );
}
