/**
 * Supervisor Dashboard - Action-first control panel
 *
 * Orchestrates dashboard data, navigation, haptics, and session creation.
 * Presentational sections live in focused supervisor dashboard components.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { useToast } from "../../src/components/feedback/ToastProvider";
import { CreateSessionModal } from "../../src/components/supervisor/dashboard/CreateSessionModal";
import {
  DashboardStats,
  DEFAULT_ZONES,
  getFallbackWarehouses,
  WarehouseOption,
  ZoneOption,
} from "../../src/components/supervisor/dashboard/supervisorDashboardShared";
import {
  AnimatedPressable,
  GlassCard,
  ScreenContainer,
  SpeedDialAction,
  SpeedDialMenu,
} from "../../src/components/ui";
import { createSession, getWarehouses, getZones } from "../../src/services/api/api";
import { dashboardReadService } from "../../src/services/dashboardReadService";
import { theme } from "../../src/styles/unifiedSystem";
import { Session } from "../../src/types";

export default function SupervisorDashboard() {
  const router = useRouter();
  const { show } = useToast();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showCreateSessionModal, setShowCreateSessionModal] = useState(false);
  const [locationType, setLocationType] = useState<string | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [rackName, setRackName] = useState("");
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(false);
  const [pendingConflictCount, setPendingConflictCount] = useState(0);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  const [stats, setStats] = useState<DashboardStats>({
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
  });

  useEffect(() => {
    const fetchZones = async () => {
      try {
        const data = await getZones();
        if (Array.isArray(data) && data.length > 0) {
          setZones(data as ZoneOption[]);
        } else {
          setZones(DEFAULT_ZONES);
        }
      } catch (error) {
        console.error("Failed to fetch zones:", error);
        setZones(DEFAULT_ZONES);
      }
    };

    fetchZones();
  }, []);

  const handleLocationTypeChange = async (type: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();

    setLocationType(type);
    setSelectedFloor(null);

    try {
      setIsLoadingWarehouses(true);
      const data = await getWarehouses(type);
      if (Array.isArray(data) && data.length > 0) {
        setWarehouses(data as WarehouseOption[]);
      } else {
        setWarehouses(getFallbackWarehouses(type));
      }
    } catch (error) {
      console.error("Failed to fetch warehouses:", error);
      setWarehouses(getFallbackWarehouses(type));
    } finally {
      setIsLoadingWarehouses(false);
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const dashboardData = await dashboardReadService.getSupervisorDashboardData();
      setSessions(dashboardData.sessions);
      setStats(dashboardData.stats);
      setActivities(dashboardData.activities);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
      Alert.alert("Error", "Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return dashboardReadService.subscribeToDashboardInvalidation(() => {
      loadData();
    });
  }, [loadData]);

  const handleCreateSession = async () => {
    if (!locationType || !selectedFloor || !rackName.trim()) {
      show("Please fill in all fields", "warning");
      return;
    }

    try {
      setIsCreatingSession(true);
      const normalizedRack = rackName.trim().toUpperCase();
      if (!/^[a-zA-Z0-9\-_]+$/.test(normalizedRack)) {
        show("Rack can use only letters, numbers, dashes, and underscores", "warning");
        return;
      }
      const warehouseName = `${locationType} - ${selectedFloor} - ${normalizedRack}`;

      const session = await createSession({
        warehouse: warehouseName,
        type: "STANDARD",
        location_type: locationType,
        location_name: selectedFloor,
        rack_no: normalizedRack,
      });

      show("Session created successfully", "success");
      setShowCreateSessionModal(false);
      setLocationType(null);
      setSelectedFloor(null);
      setRackName("");

      loadData();
      router.push(`/supervisor/session/${session.id}` as any);
    } catch (error) {
      console.error("Failed to create session:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create session";
      show(errorMessage, "error");
    } finally {
      setIsCreatingSession(false);
    }
  };

  const onRefresh = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setRefreshing(true);
    loadData();
  };

  const activeSessions = sessions.filter((session) =>
    ["OPEN", "ACTIVE"].includes(String(session.status || "").toUpperCase())
  );
  const varianceItemCount = sessions.filter(
    (session) => Math.abs(session.total_variance || 0) > 0
  ).length;
  const alertCount = pendingConflictCount + varianceItemCount + offlineQueueCount;
  const completionPercentage =
    stats.totalSessions > 0
      ? ((stats.closedSessions + stats.reconciledSessions) / stats.totalSessions) * 100
      : 0;

  return (
    <ScreenContainer
      header={{
        title: "Supervisor Dashboard",
        subtitle: "Clear daily actions for your team",
        showUsername: true,
        showLogoutButton: true,
        rightAction: {
          icon: "settings-outline",
          onPress: () => router.push("/supervisor/settings" as any),
        },
      }}
      backgroundType="solid"
      statusBarStyle="dark"
      contentMode="static"
      noPadding
    >
      {loading && !refreshing ? (
        <View style={styles.loadingState}>
          <Ionicons
            name="cube-outline"
            size={48}
            color={theme.colors.primary[500]}
            style={styles.loadingIcon}
          />
          <Text style={styles.loadingText}>Loading Dashboard...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary[500]}
              colors={[theme.colors.primary[500]]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.kpiGrid}>
            <DecisionKpi
              icon="play-circle-outline"
              label="Active Sessions"
              value={activeSessions.length}
              tone="info"
            />
            <DecisionKpi
              icon="sync-outline"
              label="Pending Conflicts"
              value={pendingConflictCount}
              tone={pendingConflictCount > 0 ? "warning" : "success"}
            />
            <DecisionKpi
              icon="alert-circle-outline"
              label="Variance Items"
              value={varianceItemCount}
              tone={varianceItemCount > 0 ? "danger" : "success"}
            />
            <DecisionKpi
              icon="cloud-offline-outline"
              label="Offline Items"
              value={offlineQueueCount}
              tone={offlineQueueCount > 0 ? "warning" : "success"}
            />
          </View>

          {alertCount > 0 ? (
            <OperationalCard style={styles.alertCard} variant="warning" elevation="xs">
              <View style={styles.alertRow}>
                <Ionicons name="warning-outline" size={20} color={ACTION_WARNING} />
                <View style={styles.alertCopy}>
                  <Text style={styles.alertTitle}>{alertCount} issue(s) need attention</Text>
                  <Text style={styles.alertBody}>
                    Clear conflicts, variance items, or offline uploads before closing the shift.
                  </Text>
                </View>
              </View>
            </OperationalCard>
          ) : (
            <OperationalCard style={styles.alertCard} variant="success" elevation="xs">
              <View style={styles.alertRow}>
                <Ionicons name="checkmark-circle-outline" size={20} color={ACTION_SUCCESS} />
                <View style={styles.alertCopy}>
                  <Text style={styles.alertTitle}>No supervisor blockers</Text>
                  <Text style={styles.alertBody}>
                    Active work can continue without review items.
                  </Text>
                </View>
              </View>
            </OperationalCard>
          )}

          <GlassCard style={styles.recommendationsCard} variant="strong">
            <View style={styles.recommendationsHeader}>
              <Ionicons name="bulb-outline" size={18} color={theme.colors.primary[400]} />
              <Text style={styles.recommendationsTitle}>Suggested next steps</Text>
            </View>
            <View style={styles.recommendationsList}>
              {recommendedActions.map((action) => (
                <AnimatedPressable
                  key={action.key}
                  style={styles.recommendationAction}
                  onPress={action.onPress}
                >
                  <View style={styles.recommendationIcon}>
                    <Ionicons name={action.icon} size={16} color={theme.colors.primary[400]} />
                  </View>
                  <View style={styles.recommendationCopy}>
                    <Text style={styles.recommendationTitle}>{action.title}</Text>
                    <Text style={styles.recommendationDescription}>{action.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
                </AnimatedPressable>
              ))}
              {activeSessions.length === 0 ? (
                <OperationalCard style={styles.emptyCard} variant="light" elevation="xs">
                  <Ionicons name="file-tray-outline" size={28} color={MUTED_TEXT} />
                  <Text style={styles.emptyTitle}>No active sessions</Text>
                  <Text style={styles.emptyBody}>
                    Create a session when staff are ready to count.
                  </Text>
                </OperationalCard>
              ) : null}
            </View>
          </GlassCard>

          <SupervisorActivitySection
            activities={activities}
            onOpenActivity={(activityId) => router.push(`/supervisor/session/${activityId}` as any)}
            onViewAll={() => router.push("/supervisor/activity-logs" as any)}
          />

          <SupervisorRecentSessionsSection
            onOpenSession={(sessionId) => router.push(`/supervisor/session/${sessionId}` as any)}
            onViewAll={() => router.push("/supervisor/sessions" as any)}
            sessions={sessions}
          />

          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}

      <CreateSessionModal
        isCreatingSession={isCreatingSession}
        isLoadingWarehouses={isLoadingWarehouses}
        locationType={locationType}
        onChangeLocationType={handleLocationTypeChange}
        onChangeRackName={setRackName}
        onChangeSelectedFloor={(value) => {
          if (Platform.OS !== "web") Haptics.selectionAsync();
          setSelectedFloor(value);
        }}
        onClose={() => setShowCreateSessionModal(false)}
        onSubmit={handleCreateSession}
        rackName={rackName}
        selectedFloor={selectedFloor}
        visible={showCreateSessionModal}
        warehouses={warehouses}
        zones={zones}
      />
    </ScreenContainer>
  );
}

type KpiTone = "info" | "success" | "warning" | "danger";

const ACTION_BLUE = "#2563eb";
const ACTION_GREEN = "#15803d";
const ACTION_SUCCESS = "#15803d";
const ACTION_WARNING = "#b45309";
const ACTION_DANGER = "#dc2626";
const TEXT_STRONG = "#0f172a";
const MUTED_TEXT = "#475569";
const SURFACE_BORDER = "#d9e5e2";

const toneColors: Record<KpiTone, { bg: string; fg: string; iconBg: string }> = {
  info: { bg: "#eff6ff", fg: ACTION_BLUE, iconBg: "#dbeafe" },
  success: { bg: "#ecfdf5", fg: ACTION_GREEN, iconBg: "#dcfce7" },
  warning: { bg: "#fffbeb", fg: ACTION_WARNING, iconBg: "#fef3c7" },
  danger: { bg: "#fef2f2", fg: ACTION_DANGER, iconBg: "#fee2e2" },
};

function DecisionKpi({
  icon,
  label,
  tone,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: KpiTone;
  value: number;
}) {
  const colors = toneColors[tone];
  return (
    <OperationalCard
      style={[styles.kpiCard, { backgroundColor: colors.bg, borderColor: colors.iconBg }]}
      variant="light"
      elevation="xs"
    >
      <View style={[styles.kpiIcon, { backgroundColor: colors.iconBg }]}>
        <Ionicons name={icon} size={18} color={colors.fg} />
      </View>
      <Text style={[styles.kpiValue, { color: colors.fg }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </OperationalCard>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  primary = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      hapticFeedback="light"
      style={[styles.quickAction, primary && styles.quickActionPrimary]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color={primary ? "#ffffff" : ACTION_BLUE} />
      <Text style={[styles.quickActionText, primary && styles.quickActionTextPrimary]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function SessionListRow({
  completionPercentage,
  onPress,
  session,
}: {
  completionPercentage: number;
  highRiskSessions: number;
  onCreateSession: () => void;
  onOpenHelp: () => void;
  onOpenSessions: () => void;
  onOpenSyncConflicts: () => void;
  onOpenVariances: () => void;
  onOpenWorkflows: () => void;
  openSessions: number;
  totalSessions: number;
}): RecommendedActionItem[] {
  const actions: RecommendedActionItem[] = [];

  if (highRiskSessions > 0) {
    actions.push({
      key: "review-variances",
      title: "Review high-risk differences",
      description: `${highRiskSessions} session(s) need supervisor review for large count differences.`,
      icon: "alert-circle-outline",
      onPress: onOpenVariances,
    });
  }

  if (openSessions > 0) {
    actions.push({
      key: "monitor-workflows",
      title: "Check active team work",
      description: `${openSessions} active session(s) are in progress and may need unblock support.`,
      icon: "git-network-outline",
      onPress: onOpenWorkflows,
    });
  }

  if (completionPercentage < 70 && totalSessions > 0) {
    actions.push({
      key: "advance-open-sessions",
      title: "Move sessions to completion",
      description: "Completion is below 70%. Review open sessions and clear pending items.",
      icon: "albums-outline",
      onPress: onOpenSessions,
    });
  }

  actions.push({
    key: "sync-health",
    title: "Resolve sync issues",
    description: "Fix sync issues so data stays up to date across devices.",
    icon: "sync-outline",
    onPress: onOpenSyncConflicts,
  });

  if (totalSessions === 0) {
    actions.unshift({
      key: "create-session",
      title: "Create first session",
      description: "No session exists yet. Start a session so staff can begin counting.",
      icon: "add-circle-outline",
      onPress: onCreateSession,
    });
  }

  if (actions.length < 3) {
    actions.push({
      key: "open-help",
      title: "Open help guide",
      description: "Need support? Use the help page for quick instructions.",
      icon: "help-circle-outline",
      onPress: onOpenHelp,
    });
  }

  return actions.slice(0, 3);
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.md,
  },
  loadingState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingIcon: {
    marginBottom: 16,
  },
  loadingText: {
    color: theme.colors.text.secondary,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  kpiCard: {
    flex: 1,
    minWidth: 136,
    minHeight: 88,
    justifyContent: "space-between",
    padding: theme.spacing.sm,
  },
  kpiIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiValue: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: "800",
  },
  kpiLabel: {
    color: MUTED_TEXT,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  alertCard: {
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
  },
  alertCopy: {
    flex: 1,
    gap: 2,
  },
  alertTitle: {
    color: TEXT_STRONG,
    fontSize: 15,
    fontWeight: "800",
  },
  alertBody: {
    color: MUTED_TEXT,
    fontSize: 12,
    lineHeight: 16,
  },
  sectionBlock: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    color: TEXT_STRONG,
    fontSize: 16,
    fontWeight: "800",
  },
  sectionLinkButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  sectionLinkText: {
    color: ACTION_BLUE,
    fontSize: 13,
    fontWeight: "800",
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  quickAction: {
    flex: 1,
    minWidth: 142,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: "#ffffff",
  },
  quickActionPrimary: {
    borderColor: ACTION_BLUE,
    backgroundColor: ACTION_BLUE,
  },
  quickActionText: {
    color: TEXT_STRONG,
    fontSize: 13,
    fontWeight: "800",
  },
  quickActionTextPrimary: {
    color: "#ffffff",
  },
  sessionList: {
    gap: theme.spacing.sm,
  },
  sessionRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: "#ffffff",
  },
  sessionIdentity: {
    flex: 1.4,
    minWidth: 120,
  },
  sessionName: {
    color: TEXT_STRONG,
    fontSize: 15,
    fontWeight: "800",
  },
  sessionMeta: {
    marginTop: 3,
    color: MUTED_TEXT,
    fontSize: 12,
    fontWeight: "600",
  },
  sessionProgressBlock: {
    flex: 1,
    minWidth: 76,
  },
  sessionProgressText: {
    color: TEXT_STRONG,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: ACTION_GREEN,
  },
  issuePill: {
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  issuePillWarning: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  issuePillText: {
    color: ACTION_GREEN,
    fontSize: 11,
    fontWeight: "800",
  },
  issuePillTextWarning: {
    color: ACTION_DANGER,
  },
  emptyCard: {
    alignItems: "center",
    padding: theme.spacing.xl,
  },
  emptyTitle: {
    marginTop: theme.spacing.sm,
    color: TEXT_STRONG,
    fontSize: 15,
    fontWeight: "800",
  },
  emptyBody: {
    marginTop: 3,
    color: MUTED_TEXT,
    fontSize: 13,
    textAlign: "center",
  },
  bottomSpacer: {
    height: 100,
  },
});
