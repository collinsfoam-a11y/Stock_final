import React, { useState, useEffect, useCallback } from "react";
import {
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
import { usePermission } from "../../src/hooks/usePermission";
import { LoadingSpinner, ScreenContainer } from "../../src/components/ui";
import { GlassCard } from "../../src/components/ui/GlassCard";
import { AnimatedPressable } from "../../src/components/ui/AnimatedPressable";
import {
  getSecuritySummary,
  getFailedLogins,
  getSuspiciousActivity,
  getSecuritySessions,
} from "../../src/services/api";
import { useSettingsStore } from "../../src/store/settingsStore";
import { auroraTheme } from "../../src/theme/auroraTheme";

const { width } = Dimensions.get("window");
const isWeb = Platform.OS === "web";
const isTablet = width > 768;

export default function SecurityScreen() {
  const router = useRouter();
  const { hasRole } = usePermission();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [failedLogins, setFailedLogins] = useState<any[]>([]);
  const [suspiciousActivity, setSuspiciousActivity] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<
    "summary" | "failed" | "suspicious" | "sessions"
  >("summary");
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const loadData = useCallback(async (isRefresh = false) => {
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

      const [summaryRes, failedRes, suspiciousRes, sessionsRes] =
        await Promise.allSettled([
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
  }, [offlineMode]);

  useEffect(() => {
    if (!hasRole("admin")) {
      Alert.alert(
        "Access Denied",
        "You do not have permission to view the security dashboard.",
        [{ text: "OK", onPress: () => router.back() }],
      );
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
          <GlassCard variant="medium" style={styles.metricCard}>
            <View
              style={[
                styles.metricIcon,
                { backgroundColor: auroraTheme.colors.error[500] + "20" },
              ]}
            >
              <Ionicons
                name="close-circle"
                size={24}
                color={auroraTheme.colors.error[500]}
              />
            </View>
            <Text style={styles.metricValue}>{stats.failed_logins || 0}</Text>
            <Text style={styles.metricLabel}>Failed Logins (24h)</Text>
          </GlassCard>

          <GlassCard variant="medium" style={styles.metricCard}>
            <View
              style={[
                styles.metricIcon,
                { backgroundColor: auroraTheme.colors.success[500] + "20" },
              ]}
            >
              <Ionicons
                name="checkmark-circle"
                size={24}
                color={auroraTheme.colors.success[500]}
              />
            </View>
            <Text style={styles.metricValue}>
              {stats.successful_logins || 0}
            </Text>
            <Text style={styles.metricLabel}>Total Logins (24h)</Text>
          </GlassCard>

          <GlassCard variant="medium" style={styles.metricCard}>
            <View
              style={[
                styles.metricIcon,
                { backgroundColor: auroraTheme.colors.primary[500] + "20" },
              ]}
            >
              <Ionicons
                name="people"
                size={24}
                color={auroraTheme.colors.primary[500]}
              />
            </View>
            <Text style={styles.metricValue}>{stats.active_sessions || 0}</Text>
            <Text style={styles.metricLabel}>Active Sessions</Text>
          </GlassCard>

          <GlassCard variant="medium" style={styles.metricCard}>
            <View
              style={[
                styles.metricIcon,
                { backgroundColor: auroraTheme.colors.warning[500] + "20" },
              ]}
            >
              <Ionicons
                name="globe-outline"
                size={24}
                color={auroraTheme.colors.warning[500]}
              />
            </View>
            <Text style={styles.metricValue}>{stats.suspicious_ips || 0}</Text>
            <Text style={styles.metricLabel}>Flagged IPs</Text>
          </GlassCard>
        </View>

        {summary.recent_events && summary.recent_events.length > 0 && (
          <GlassCard variant="strong" style={styles.eventsCard}>
            <Text style={styles.subsectionTitle}>Critical Security Events</Text>
            {summary.recent_events
              .slice(0, 10)
              .map((event: any, index: number) => (
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
          </GlassCard>
        )}
      </View>
    );
  };

  const renderFailedLogins = () => (
    <View style={styles.tabContent}>
      {failedLogins.length === 0 ? (
        <EmptyState
          message="No failed login attempts in the last 24 hours"
          icon="shield-checkmark"
        />
      ) : (
        <View style={styles.listContainer}>
          {failedLogins.map((login: any, index: number) => (
            <GlassCard key={index} variant="medium" style={styles.listItem}>
              <View
                style={[
                  styles.listItemIcon,
                  { backgroundColor: auroraTheme.colors.error[500] + "15" },
                ]}
              >
                <Ionicons
                  name="warning-outline"
                  size={20}
                  color={auroraTheme.colors.error[500]}
                />
              </View>
              <View style={styles.listItemContent}>
                <Text style={styles.listItemTitle}>
                  {login.username || "Anonymous"}
                </Text>
                <Text style={styles.listItemSubtitle}>
                  IP: {login.ip_address}
                </Text>
                <Text style={styles.listItemReason}>
                  Error: {login.error || "Authentication failed"}
                </Text>
              </View>
              <Text style={styles.listItemTime}>
                {new Date(login.timestamp).toLocaleTimeString()}
              </Text>
            </GlassCard>
          ))}
        </View>
      )}
    </View>
  );

  const renderSuspiciousActivity = () => {
    if (!suspiciousActivity) return <LoadingSpinner />;

    return (
      <View style={styles.tabContent}>
        {(suspiciousActivity.suspicious_ips || []).map(
          (item: any, index: number) => (
            <GlassCard
              key={`ip-${index}`}
              variant="medium"
              style={styles.suspiciousCard}
            >
              <View style={styles.suspiciousHeader}>
                <Ionicons
                  name="globe"
                  size={24}
                  color={auroraTheme.colors.warning[500]}
                />
                <Text style={styles.suspiciousTitle}>{item.ip_address}</Text>
                <View style={styles.riskBadge}>
                  <Text style={styles.riskText}>RISK</Text>
                </View>
              </View>
              <Text style={styles.suspiciousDetail}>
                {item.count} failed attempts across{" "}
                {item.usernames?.length || 0} identifiers.
              </Text>
              <Text style={styles.suspiciousFooter}>
                Last attempt: {new Date(item.last_attempt).toLocaleString()}
              </Text>
            </GlassCard>
          ),
        )}
        {!suspiciousActivity.suspicious_ips?.length &&
          !suspiciousActivity.suspicious_users?.length && (
            <EmptyState
              message="No suspicious activity patterns detected"
              icon="finger-print"
            />
          )}
      </View>
    );
  };

  const renderSessions = () => (
    <View style={styles.tabContent}>
      {sessions.length === 0 ? (
        <EmptyState message="No active administrative sessions" icon="people" />
      ) : (
        <View style={styles.listContainer}>
          {sessions.map((session: any, index: number) => (
            <GlassCard key={index} variant="medium" style={styles.listItem}>
              <View style={styles.sessionAvatar}>
                <Text style={styles.avatarText}>
                  {session.username?.[0]?.toUpperCase()}
                </Text>
              </View>
              <View style={styles.listItemContent}>
                <Text style={styles.listItemTitle}>
                  {session.username}{" "}
                  <Text style={styles.roleTag}>({session.role})</Text>
                </Text>
                <Text style={styles.listItemSubtitle}>
                  {session.ip_address} •{" "}
                  {session.user_agent?.split(" ")[0] || "Unknown Client"}
                </Text>
              </View>
              <View style={styles.activeTag}>
                <View style={styles.pulseDot} />
                <Text style={styles.activeLabel}>Live</Text>
              </View>
            </GlassCard>
          ))}
        </View>
      )}
    </View>
  );

  const EmptyState = ({ message, icon }: { message: string; icon: any }) => (
    <View style={styles.emptyContainer}>
      <GlassCard variant="light" style={styles.emptyContent}>
        <Ionicons name={icon} size={64} color={auroraTheme.colors.text.muted} />
        <Text style={styles.emptyText}>{message}</Text>
      </GlassCard>
    </View>
  );

  return (
    <ScreenContainer
      backgroundType="aurora"
      auroraVariant="dark"
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
          >
            <Ionicons
              name="sync"
              size={22}
              color="#fff"
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
            >
              <Ionicons
                name={tab.icon as any}
                size={18}
                color={
                  activeTab === tab.id ? "#fff" : auroraTheme.colors.text.muted
                }
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab.id && styles.activeTabText,
                ]}
              >
                {tab.label}
              </Text>
            </AnimatedPressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContainer,
          isWeb && styles.scrollContainerWeb,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            tintColor={auroraTheme.colors.primary[500]}
          />
        }
      >
        {offlineMode ? (
          <GlassCard variant="medium" style={styles.offlineNotice}>
            <Text style={styles.offlineNoticeTitle}>
              Security monitoring requires a live connection
            </Text>
            <Text style={styles.offlineNoticeBody}>
              Failed logins, suspicious activity, and active session telemetry
              are loaded from backend services and are not available offline.
            </Text>
          </GlassCard>
        ) : (
          <>
            {activeTab === "summary" && renderSummary()}
            {activeTab === "failed" && renderFailedLogins()}
            {activeTab === "suspicious" && renderSuspiciousActivity()}
            {activeTab === "sessions" && renderSessions()}
          </>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Enterprise Security Engine v2.0</Text>
          <Text style={styles.footerSubtext}>
            System integrity checked at {lastUpdate.toLocaleTimeString()}
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tabsWrapper: {
    paddingVertical: 8,
    backgroundColor: "rgba(10, 15, 30, 0.4)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  tabsContainer: {
    flexGrow: 0,
  },
  tabsContent: {
    paddingHorizontal: auroraTheme.spacing.md,
    gap: 10,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    gap: 8,
  },
  activeTab: {
    backgroundColor: auroraTheme.colors.primary[600],
    borderColor: auroraTheme.colors.primary[400],
  },
  tabText: {
    color: auroraTheme.colors.text.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  activeTabText: {
    color: "#fff",
  },
  disabledButton: {
    opacity: 0.45,
  },
  scrollView: {
    flex: 1,
  },
  scrollContainer: {
    padding: auroraTheme.spacing.md,
    paddingBottom: 40,
  },
  scrollContainerWeb: {
    maxWidth: 1200,
    alignSelf: "center",
    width: "100%",
  },
  tabContent: {
    gap: 16,
  },
  offlineNotice: {
    padding: auroraTheme.spacing.lg,
  },
  offlineNoticeTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: auroraTheme.colors.text.primary,
    marginBottom: 6,
  },
  offlineNoticeBody: {
    fontSize: 13,
    lineHeight: 20,
    color: auroraTheme.colors.text.secondary,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: isTablet ? "23%" : "47%",
    padding: auroraTheme.spacing.lg,
    alignItems: "center",
  },
  metricIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: "800",
    color: auroraTheme.colors.text.primary,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: auroraTheme.colors.text.muted,
    textTransform: "uppercase",
    marginTop: 4,
    textAlign: "center",
  },
  eventsCard: {
    padding: auroraTheme.spacing.lg,
    marginTop: 8,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: auroraTheme.colors.text.primary,
    marginBottom: 16,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  eventRow: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
    gap: 12,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: auroraTheme.colors.primary[500],
    marginTop: 6,
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
    color: auroraTheme.colors.text.primary,
    textTransform: "capitalize",
  },
  eventTime: {
    fontSize: 11,
    color: auroraTheme.colors.text.muted,
  },
  eventUser: {
    fontSize: 12,
    color: auroraTheme.colors.text.secondary,
    marginTop: 2,
  },
  listContainer: {
    gap: 10,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: auroraTheme.spacing.lg,
    gap: 16,
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
    color: auroraTheme.colors.text.primary,
  },
  listItemSubtitle: {
    fontSize: 12,
    color: auroraTheme.colors.text.muted,
    marginTop: 2,
  },
  listItemReason: {
    fontSize: 11,
    color: auroraTheme.colors.error[400],
    marginTop: 4,
    fontWeight: "500",
  },
  listItemTime: {
    fontSize: 11,
    color: auroraTheme.colors.text.muted,
  },
  suspiciousCard: {
    padding: auroraTheme.spacing.lg,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: auroraTheme.colors.warning[500],
  },
  suspiciousHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  suspiciousTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: auroraTheme.colors.text.primary,
    flex: 1,
  },
  riskBadge: {
    backgroundColor: auroraTheme.colors.error[600],
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  riskText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#fff",
  },
  suspiciousDetail: {
    fontSize: 14,
    color: auroraTheme.colors.text.secondary,
    lineHeight: 20,
  },
  suspiciousFooter: {
    fontSize: 11,
    color: auroraTheme.colors.text.muted,
    marginTop: 12,
    fontStyle: "italic",
  },
  sessionAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: auroraTheme.colors.primary[700],
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: auroraTheme.colors.primary[400],
  },
  avatarText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 18,
  },
  roleTag: {
    fontSize: 12,
    color: auroraTheme.colors.primary[400],
    fontWeight: "400",
  },
  activeTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: auroraTheme.colors.success[500],
  },
  activeLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: auroraTheme.colors.success[500],
    textTransform: "uppercase",
  },
  refreshButton: {
    padding: 8,
  },
  refreshingIcon: {
    opacity: 0.5,
  },
  emptyContainer: {
    paddingVertical: 40,
  },
  emptyContent: {
    padding: 40,
    alignItems: "center",
    gap: 16,
  },
  emptyText: {
    color: auroraTheme.colors.text.muted,
    fontSize: 15,
    textAlign: "center",
  },
  footer: {
    marginTop: 32,
    alignItems: "center",
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    fontWeight: "700",
    color: auroraTheme.colors.text.muted,
  },
  footerSubtext: {
    fontSize: 10,
    color: auroraTheme.colors.text.disabled,
  },
});
