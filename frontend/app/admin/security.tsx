import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Dimensions,
  RefreshControl,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { usePermission } from "@/hooks/usePermission";
import { LoadingSpinner, ScreenContainer } from "@/components/ui";
import ModernCard from "@/components/ui/ModernCard";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import {
  getSecuritySummary,
  getFailedLogins,
  getSuspiciousActivity,
  getSecuritySessions,
} from "@/services/api";
import { useSettingsStore } from "@/store/settingsStore";
import { safeBackNavigation } from "@/utils/navigation";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";

const { width } = Dimensions.get("window");
const isWeb = Platform.OS === "web";
const isTablet = width > 768;

export default function SecurityScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const { hasRole } = usePermission();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [failedLogins, setFailedLogins] = useState<any[]>([]);
  const [suspiciousActivity, setSuspiciousActivity] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"summary" | "failed" | "suspicious" | "sessions">(
    "summary"
  );
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (offlineMode) {
        if (isRefresh) {
          setRefreshing(true);
        }
        setSummary(null);
        setFailedLogins([]);
        setSuspiciousActivity(null);
        setSessions([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const [summaryRes, failedRes, suspiciousRes, sessionsRes] = await Promise.allSettled([
          getSecuritySummary(),
          getFailedLogins(50, 24).catch(() => ({
            success: false,
            data: { failed_logins: [] },
          })),
          getSuspiciousActivity(24).catch(() => ({
            success: false,
            data: null,
          })),
          getSecuritySessions(50, false).catch(() => ({
            success: false,
            data: { sessions: [] },
          })),
        ]);

        if (summaryRes.status === "fulfilled" && summaryRes.value.success)
          setSummary(summaryRes.value.data);
        if (failedRes.status === "fulfilled" && failedRes.value.success)
          setFailedLogins(failedRes.value.data?.failed_logins || []);
        if (suspiciousRes.status === "fulfilled" && suspiciousRes.value.success)
          setSuspiciousActivity(suspiciousRes.value.data);
        if (sessionsRes.status === "fulfilled" && sessionsRes.value.success)
          setSessions(sessionsRes.value.data?.sessions || []);

        setLastUpdate(new Date());
      } catch (error: any) {
        if (!isRefresh) {
          console.error("Security data load error:", error);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [offlineMode]
  );

  useEffect(() => {
    if (!hasRole("admin")) {
      Alert.alert("Access Denied", "You do not have permission to view the security dashboard.", [
        { text: "OK", onPress: () => safeBackNavigation(router, { userRole: "admin" }) },
      ]);
      return;
    }
    void loadData();

    if (offlineMode) {
      return;
    }

    const interval = setInterval(() => {
      void loadData();
    }, 60000);
    return () => clearInterval(interval);
  }, [hasRole, loadData, offlineMode, router]);

  const renderSummary = () => {
    if (!summary) return <LoadingSpinner />;
    const stats = summary.summary || {};

    return (
      <View style={styles.tabContent}>
        <View style={styles.metricsGrid}>
          <ModernCard variant="outlined" elevation="none" padding={0} style={styles.metricCard}>
            <View
              style={[styles.metricIcon, { backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.12) }]}
            >
              <Ionicons name="close-circle" size={24} color={uiTokens.colors.error} />
            </View>
            <Text style={styles.metricValue}>{stats.failed_logins || 0}</Text>
            <Text style={styles.metricLabel}>Failed Logins (24h)</Text>
          </ModernCard>

          <ModernCard variant="outlined" elevation="none" padding={0} style={styles.metricCard}>
            <View
              style={[
                styles.metricIcon,
                { backgroundColor: colorWithAlpha(uiTokens.colors.success, 0.12) },
              ]}
            >
              <Ionicons name="checkmark-circle" size={24} color={uiTokens.colors.success} />
            </View>
            <Text style={styles.metricValue}>{stats.successful_logins || 0}</Text>
            <Text style={styles.metricLabel}>Total Logins (24h)</Text>
          </ModernCard>

          <ModernCard variant="outlined" elevation="none" padding={0} style={styles.metricCard}>
            <View
              style={[
                styles.metricIcon,
                { backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.12) },
              ]}
            >
              <Ionicons name="people" size={24} color={uiTokens.colors.accent} />
            </View>
            <Text style={styles.metricValue}>{stats.active_sessions || 0}</Text>
            <Text style={styles.metricLabel}>Active Sessions</Text>
          </ModernCard>

          <ModernCard variant="outlined" elevation="none" padding={0} style={styles.metricCard}>
            <View
              style={[
                styles.metricIcon,
                { backgroundColor: colorWithAlpha(uiTokens.colors.warning, 0.12) },
              ]}
            >
              <Ionicons name="globe-outline" size={24} color={uiTokens.colors.warning} />
            </View>
            <Text style={styles.metricValue}>{stats.suspicious_ips || 0}</Text>
            <Text style={styles.metricLabel}>Flagged IPs</Text>
          </ModernCard>
        </View>

        {summary.recent_events && summary.recent_events.length > 0 && (
          <ModernCard variant="outlined" elevation="none" padding={0} style={styles.eventsCard}>
            <Text style={styles.subsectionTitle}>Critical Security Events</Text>
            {summary.recent_events.slice(0, 10).map((event: any, index: number) => (
              <View key={index} style={styles.eventRow}>
                <View style={styles.eventDot} />
                <View style={styles.eventInfo}>
                  <View style={styles.eventHeaderRow}>
                    <Text style={styles.eventAction}>{event.action}</Text>
                    <Text style={styles.eventTime}>
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </Text>
                  </View>
                  <Text style={styles.eventUser}>
                    {event.user} • {event.ip_address || "internal"}
                  </Text>
                </View>
              </View>
            ))}
          </ModernCard>
        )}
      </View>
    );
  };

  const renderFailedLoginItem = ({ item: login }: { item: any }) => (
    <ModernCard variant="outlined" elevation="none" padding={0} style={styles.listItem}>
      <View
        style={[styles.listItemIcon, { backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.1) }]}
      >
        <Ionicons name="warning-outline" size={20} color={uiTokens.colors.error} />
      </View>
      <View style={styles.listItemContent}>
        <Text style={styles.listItemTitle}>{login.username || "Anonymous"}</Text>
        <Text style={styles.listItemSubtitle}>IP: {login.ip_address}</Text>
        <Text style={styles.listItemReason}>
          Error: {login.error || "Authentication failed"}
        </Text>
      </View>
      <Text style={styles.listItemTime}>
        {new Date(login.timestamp).toLocaleTimeString()}
      </Text>
    </ModernCard>
  );

  const renderSuspiciousItem = ({ item }: { item: any }) => (
    <ModernCard variant="outlined" elevation="none" padding={0} style={styles.suspiciousCard}>
      <View style={styles.suspiciousHeader}>
        <Ionicons name="globe" size={24} color={uiTokens.colors.warning} />
        <Text style={styles.suspiciousTitle}>{item.ip_address}</Text>
        <View style={styles.riskBadge}>
          <Text style={styles.riskText}>RISK</Text>
        </View>
      </View>
      <Text style={styles.suspiciousDetail}>
        {item.count} failed attempts across {item.usernames?.length || 0} identifiers.
      </Text>
      <Text style={styles.suspiciousFooter}>
        Last attempt: {new Date(item.last_attempt).toLocaleString()}
      </Text>
    </ModernCard>
  );

  const renderSessionItem = ({ item: session }: { item: any }) => (
    <ModernCard variant="outlined" elevation="none" padding={0} style={styles.listItem}>
      <View style={styles.sessionAvatar}>
        <Text style={styles.avatarText}>{session.username?.[0]?.toUpperCase()}</Text>
      </View>
      <View style={styles.listItemContent}>
        <Text style={styles.listItemTitle}>
          {session.username} <Text style={styles.roleTag}>({session.role})</Text>
        </Text>
        <Text style={styles.listItemSubtitle}>
          {session.ip_address} • {session.user_agent?.split(" ")[0] || "Unknown Client"}
        </Text>
      </View>
      <View style={styles.activeTag}>
        <View style={styles.pulseDot} />
        <Text style={styles.activeLabel}>Live</Text>
      </View>
    </ModernCard>
  );

  const EmptyState = ({ message, icon }: { message: string; icon: any }) => (
    <View style={styles.emptyContainer}>
      <ModernCard variant="outlined" elevation="none" padding={0} style={styles.emptyContent}>
        <Ionicons name={icon} size={64} color={uiTokens.colors.textMuted} />
        <Text style={styles.emptyText}>{message}</Text>
      </ModernCard>
    </View>
  );

  const ListGap = () => <View style={styles.listGap} />;

  const renderFooter = () => (
    <View style={styles.footer}>
      <Text style={styles.footerText}>Enterprise Security Engine v2.0</Text>
      <Text style={styles.footerSubtext}>
        System integrity checked at {lastUpdate.toLocaleTimeString()}
      </Text>
    </View>
  );

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => loadData(true)}
      tintColor={uiTokens.colors.accent}
    />
  );

  const renderStaticContent = (content: React.ReactElement) => (
    <FlatList
      contentContainerStyle={[styles.scrollContainer, isWeb && styles.scrollContainerWeb]}
      data={[]}
      keyExtractor={(_, index) => `static-${index}`}
      ListFooterComponent={renderFooter}
      ListHeaderComponent={content}
      refreshControl={refreshControl}
      renderItem={() => null}
    />
  );

  const renderActiveContent = () => {
    if (offlineMode) {
      return renderStaticContent(
        <ModernCard variant="outlined" elevation="none" padding={0} style={styles.offlineNotice}>
          <Text style={styles.offlineNoticeTitle}>
            Security monitoring requires a live connection
          </Text>
          <Text style={styles.offlineNoticeBody}>
            Failed logins, suspicious activity, and active session telemetry are loaded from backend
            services and are not available offline.
          </Text>
        </ModernCard>
      );
    }

    if (activeTab === "summary") {
      return renderStaticContent(renderSummary());
    }

    if (activeTab === "failed") {
      return (
        <FlatList
          contentContainerStyle={[styles.scrollContainer, isWeb && styles.scrollContainerWeb]}
          data={failedLogins}
          ItemSeparatorComponent={ListGap}
          keyExtractor={(login, index) =>
            `${login.username || "failed"}-${login.timestamp || index}`
          }
          ListEmptyComponent={
            <EmptyState
              message="No failed login attempts in the last 24 hours"
              icon="shield-checkmark"
            />
          }
          ListFooterComponent={renderFooter}
          refreshControl={refreshControl}
          renderItem={renderFailedLoginItem}
        />
      );
    }

    if (activeTab === "suspicious") {
      if (!suspiciousActivity) return renderStaticContent(<LoadingSpinner />);

      return (
        <FlatList
          contentContainerStyle={[styles.scrollContainer, isWeb && styles.scrollContainerWeb]}
          data={suspiciousActivity.suspicious_ips || []}
          ItemSeparatorComponent={ListGap}
          keyExtractor={(item, index) => `${item.ip_address || "ip"}-${index}`}
          ListEmptyComponent={
            !suspiciousActivity.suspicious_users?.length ? (
              <EmptyState message="No suspicious activity patterns detected" icon="finger-print" />
            ) : null
          }
          ListFooterComponent={renderFooter}
          refreshControl={refreshControl}
          renderItem={renderSuspiciousItem}
        />
      );
    }

    return (
      <FlatList
        contentContainerStyle={[styles.scrollContainer, isWeb && styles.scrollContainerWeb]}
        data={sessions}
        ItemSeparatorComponent={ListGap}
        keyExtractor={(session, index) =>
          `${session.id || session.session_id || session.username || "session"}-${index}`
        }
        ListEmptyComponent={<EmptyState message="No active administrative sessions" icon="people" />}
        ListFooterComponent={renderFooter}
        refreshControl={refreshControl}
        renderItem={renderSessionItem}
      />
    );
  };

  return (
    <ScreenContainer
      backgroundType="solid"
      loading={loading}
      header={{
        title: "Security Monitoring",
        subtitle: offlineMode
          ? "Security monitoring unavailable offline"
          : `Vault Status: SECURE • Last Audit: ${lastUpdate.toLocaleTimeString()}`,
        showBackButton: true,
        customRightContent: (
          <AnimatedPressable
            style={[styles.refreshButton, offlineMode && styles.disabledButton]}
            onPress={() => loadData(true)}
            disabled={offlineMode}
            {...getAccessibleButtonProps({
              label: "Refresh security monitoring data",
              disabled: offlineMode,
              busy: refreshing,
            })}
          >
            <Ionicons
              name="sync"
              size={22}
              color={uiTokens.colors.textPrimary}
              style={refreshing ? styles.refreshingIcon : undefined}
            />
          </AnimatedPressable>
        ),
      }}
    >
      {/* Tab Navigation */}
      <View style={styles.tabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsContainer}
          contentContainerStyle={styles.tabsContent}
        >
          {[
            { id: "summary", label: "Global", icon: "shield" },
            { id: "failed", label: "Attempts", icon: "close-circle" },
            { id: "suspicious", label: "Risk Signals", icon: "pulse" },
            { id: "sessions", label: "Sessions", icon: "people" },
          ].map((tab) => (
            <AnimatedPressable
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.activeTab]}
              onPress={() => setActiveTab(tab.id as any)}
              {...getAccessibleButtonProps({
                label: `Open ${tab.label} security tab`,
                selected: activeTab === tab.id,
              })}
            >
              <Ionicons
                name={tab.icon as any}
                size={18}
                color={activeTab === tab.id ? uiTokens.colors.surface : uiTokens.colors.textMuted}
              />
              <Text style={[styles.tabText, activeTab === tab.id && styles.activeTabText]}>
                {tab.label}
              </Text>
            </AnimatedPressable>
          ))}
        </ScrollView>
      </View>

      {renderActiveContent()}
    </ScreenContainer>
  );
}

type SecurityTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: SecurityTokens) =>
  StyleSheet.create({
  tabsWrapper: {
    paddingVertical: uiTokens.spacing.sm,
    backgroundColor: uiTokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: uiTokens.colors.border,
  },
  tabsContainer: {
    flexGrow: 0,
  },
  tabsContent: {
    paddingHorizontal: uiTokens.spacing.md,
    gap: uiTokens.spacing.sm,
  },
  tab: {
    ...getMinimumTouchTargetStyle(),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTokens.spacing.md,
    paddingVertical: uiTokens.spacing.sm,
    borderRadius: uiTokens.radius.full,
    backgroundColor: uiTokens.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: uiTokens.colors.border,
    gap: uiTokens.spacing.sm,
  },
  activeTab: {
    backgroundColor: uiTokens.colors.accent,
    borderColor: uiTokens.colors.accent,
  },
  tabText: {
    color: uiTokens.colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  activeTabText: {
    color: uiTokens.colors.surface,
  },
  disabledButton: {
    opacity: 0.45,
  },
  scrollView: {
    flex: 1,
  },
  scrollContainer: {
    padding: uiTokens.spacing.md,
    paddingBottom: uiTokens.spacing["3xl"],
  },
  scrollContainerWeb: {
    maxWidth: 1200,
    alignSelf: "center",
    width: "100%",
  },
  tabContent: {
    gap: uiTokens.spacing.md,
  },
  offlineNotice: {
    padding: uiTokens.spacing.lg,
  },
  offlineNoticeTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: uiTokens.colors.textPrimary,
    marginBottom: uiTokens.spacing.xs,
  },
  offlineNoticeBody: {
    fontSize: 13,
    lineHeight: 20,
    color: uiTokens.colors.textSecondary,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTokens.spacing.md,
  },
  metricCard: {
    flex: 1,
    minWidth: isTablet ? "23%" : "47%",
    padding: uiTokens.spacing.lg,
    alignItems: "center",
  },
  metricIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: uiTokens.spacing.md,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: "800",
    color: uiTokens.colors.textPrimary,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: uiTokens.colors.textMuted,
    textTransform: "uppercase",
    marginTop: uiTokens.spacing.xs,
    textAlign: "center",
  },
  eventsCard: {
    padding: uiTokens.spacing.lg,
    marginTop: uiTokens.spacing.sm,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: uiTokens.colors.textPrimary,
    marginBottom: uiTokens.spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  eventRow: {
    flexDirection: "row",
    paddingVertical: uiTokens.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colorWithAlpha(uiTokens.colors.textMuted, 0.12),
    gap: uiTokens.spacing.md,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: uiTokens.colors.accent,
    marginTop: uiTokens.spacing.xs,
  },
  eventHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eventInfo: {
    flex: 1,
  },
  eventAction: {
    fontSize: 14,
    fontWeight: "700",
    color: uiTokens.colors.textPrimary,
    textTransform: "capitalize",
  },
  eventTime: {
    fontSize: 11,
    color: uiTokens.colors.textMuted,
  },
  eventUser: {
    fontSize: 12,
    color: uiTokens.colors.textSecondary,
    marginTop: uiTokens.spacing.xxs,
  },
  listContainer: {
    gap: uiTokens.spacing.sm,
  },
  listGap: {
    height: uiTokens.spacing.sm,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: uiTokens.spacing.lg,
    gap: uiTokens.spacing.md,
  },
  listItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: uiTokens.colors.textPrimary,
  },
  listItemSubtitle: {
    fontSize: 12,
    color: uiTokens.colors.textMuted,
    marginTop: uiTokens.spacing.xxs,
  },
  listItemReason: {
    fontSize: 11,
    color: uiTokens.colors.error,
    marginTop: uiTokens.spacing.xs,
    fontWeight: "500",
  },
  listItemTime: {
    fontSize: 11,
    color: uiTokens.colors.textMuted,
  },
  suspiciousCard: {
    padding: uiTokens.spacing.lg,
    marginBottom: uiTokens.spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: uiTokens.colors.warning,
  },
  suspiciousHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.spacing.md,
    marginBottom: uiTokens.spacing.sm,
  },
  suspiciousTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: uiTokens.colors.textPrimary,
    flex: 1,
  },
  riskBadge: {
    backgroundColor: uiTokens.colors.error,
    paddingHorizontal: uiTokens.spacing.sm,
    paddingVertical: uiTokens.spacing.xxs,
    borderRadius: uiTokens.radius.sm,
  },
  riskText: {
    fontSize: 9,
    fontWeight: "900",
    color: uiTokens.colors.surface,
  },
  suspiciousDetail: {
    fontSize: 14,
    color: uiTokens.colors.textSecondary,
    lineHeight: 20,
  },
  suspiciousFooter: {
    fontSize: 11,
    color: uiTokens.colors.textMuted,
    marginTop: uiTokens.spacing.md,
    fontStyle: "italic",
  },
  sessionAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.18),
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: uiTokens.colors.accent,
  },
  avatarText: {
    color: uiTokens.colors.accentStrong,
    fontWeight: "800",
    fontSize: 18,
  },
  roleTag: {
    fontSize: 12,
    color: uiTokens.colors.accent,
    fontWeight: "400",
  },
  activeTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colorWithAlpha(uiTokens.colors.success, 0.1),
    paddingHorizontal: uiTokens.spacing.sm,
    paddingVertical: uiTokens.spacing.xs,
    borderRadius: uiTokens.radius.lg,
    gap: uiTokens.spacing.xs,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: uiTokens.colors.success,
  },
  activeLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: uiTokens.colors.success,
    textTransform: "uppercase",
  },
  refreshButton: {
    ...getMinimumTouchTargetStyle(),
    alignItems: "center",
    justifyContent: "center",
    padding: uiTokens.spacing.sm,
  },
  refreshingIcon: {
    opacity: 0.5,
  },
  emptyContainer: {
    paddingVertical: uiTokens.spacing["3xl"],
  },
  emptyContent: {
    padding: uiTokens.spacing["3xl"],
    alignItems: "center",
    gap: uiTokens.spacing.md,
  },
  emptyText: {
    color: uiTokens.colors.textMuted,
    fontSize: 15,
    textAlign: "center",
  },
  footer: {
    marginTop: uiTokens.spacing.xl,
    alignItems: "center",
    gap: uiTokens.spacing.xs,
  },
  footerText: {
    fontSize: 12,
    fontWeight: "700",
    color: uiTokens.colors.textMuted,
  },
  footerSubtext: {
    fontSize: 10,
    color: uiTokens.colors.textMuted,
  },
});
