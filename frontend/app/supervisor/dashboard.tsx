/**
 * Supervisor Dashboard v2.0 - Aurora Design
 *
 * Orchestrates dashboard data, navigation, haptics, and session creation.
 * Presentational sections live in focused supervisor dashboard components.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { useToast } from "../../src/components/feedback/ToastProvider";
import { CreateSessionModal } from "../../src/components/supervisor/dashboard/CreateSessionModal";
import {
  OverviewAction,
  SupervisorOverviewCard,
} from "../../src/components/supervisor/dashboard/SupervisorOverviewCard";
import { SupervisorStatsSection } from "../../src/components/supervisor/dashboard/SupervisorStatsSection";
import { SupervisorActivitySection } from "../../src/components/supervisor/dashboard/SupervisorActivitySection";
import { SupervisorRecentSessionsSection } from "../../src/components/supervisor/dashboard/SupervisorRecentSessionsSection";
import {
  ActivityItem,
  DashboardStats,
  DEFAULT_ZONES,
  getFallbackWarehouses,
  WarehouseOption,
  ZoneOption,
} from "../../src/components/supervisor/dashboard/supervisorDashboardShared";
import {
  ActivityType,
  AnimatedPressable,
  GlassCard,
  ScreenContainer,
  SpeedDialAction,
  SpeedDialMenu,
} from "../../src/components/ui";
import {
  createSession,
  getSessions,
  getWarehouses,
  getZones,
} from "../../src/services/api/api";
import { theme } from "../../src/styles/modernDesignSystem";
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
  const [activities, setActivities] = useState<ActivityItem[]>([]);

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
      const sessionsRes = await getSessions(1, 100);
      const sessionData = sessionsRes.items || [];
      setSessions(sessionData);

      const nextStats = sessionData.reduce(
        (acc: DashboardStats, session: Session) => {
          acc.totalSessions++;
          if (session.status === "OPEN") acc.openSessions++;
          if (session.status === "CLOSED") acc.closedSessions++;
          if (session.status === "RECONCILE") acc.reconciledSessions++;

          acc.totalItems += session.total_items || 0;
          acc.totalVariance += session.total_variance || 0;

          if ((session.total_variance || 0) > 0) {
            acc.positiveVariance += session.total_variance;
          }
          if ((session.total_variance || 0) < 0) {
            acc.negativeVariance += session.total_variance;
          }
          if (Math.abs(session.total_variance ?? 0) > 1000) {
            acc.highRiskSessions++;
          }

          return acc;
        },
        {
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
        },
      );

      nextStats.avgVariancePerSession =
        nextStats.totalSessions > 0
          ? nextStats.totalVariance / nextStats.totalSessions
          : 0;

      setStats(nextStats);

      const recentActivities: ActivityItem[] = sessionData
        .slice(0, 10)
        .map((session: Session) => ({
          id: session.id,
          type: "session" as ActivityType,
          title: `Session ${session.status.toLowerCase()}`,
          description: `${session.warehouse} - ${session.staff_name || "Unknown"} - ${session.total_items} items`,
          timestamp: new Date(session.started_at),
          status:
            session.status === "OPEN"
              ? "info"
              : session.status === "CLOSED"
                ? "success"
                : "warning",
        }));

      setActivities(recentActivities);
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

  const handleCreateSession = async () => {
    if (!locationType || !selectedFloor || !rackName.trim()) {
      show("Please fill in all fields", "warning");
      return;
    }

    try {
      setIsCreatingSession(true);
      const normalizedRack = rackName.trim().toUpperCase();
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
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create session";
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

  const handleStatPress = (statType: "total" | "open" | "items" | "risk") => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    switch (statType) {
      case "total":
      case "open":
        router.push("/supervisor/sessions" as any);
        break;
      case "items":
        router.push("/supervisor/items" as any);
        break;
      case "risk":
        router.push("/supervisor/variances" as any);
        break;
    }
  };

  const speedDialActions: SpeedDialAction[] = [
    {
      icon: "add-circle-outline",
      label: "New Session",
      onPress: () => setShowCreateSessionModal(true),
    },
    {
      icon: "albums-outline",
      label: "Count Sessions",
      onPress: () => router.push("/supervisor/sessions" as any),
    },
    {
      icon: "alert-circle-outline",
      label: "Count Differences",
      onPress: () => router.push("/supervisor/variances" as any),
    },
    {
      icon: "git-network-outline",
      label: "Team Activity",
      onPress: () => router.push("/supervisor/user-workflows" as any),
    },
    {
      icon: "cloud-offline-outline",
      label: "Pending Uploads",
      onPress: () => router.push("/supervisor/offline-queue" as any),
    },
    {
      icon: "sync-outline",
      label: "Sync Issues",
      onPress: () => router.push("/supervisor/sync-conflicts" as any),
    },
    {
      icon: "settings-outline",
      label: "Preferences",
      onPress: () => router.push("/supervisor/settings" as any),
    },
    {
      icon: "help-circle-outline",
      label: "Help",
      onPress: () => router.push("/help" as any),
    },
  ];

  const overviewActions: OverviewAction[] = [
    {
      key: "new-session",
      icon: "add-circle-outline",
      label: "Create session",
      onPress: () => setShowCreateSessionModal(true),
      primary: true,
    },
    {
      key: "review-variances",
      icon: "alert-circle-outline",
      label: "Review differences",
      onPress: () => router.push("/supervisor/variances" as any),
      primary: false,
    },
    {
      key: "sync-conflicts",
      icon: "sync-outline",
      label: "Resolve sync issues",
      onPress: () => router.push("/supervisor/sync-conflicts" as any),
      primary: false,
    },
  ];

  const completionPercentage =
    stats.totalSessions > 0
      ? ((stats.closedSessions + stats.reconciledSessions) /
          stats.totalSessions) *
        100
      : 0;
  const recommendedActions = buildRecommendedActions({
    completionPercentage,
    highRiskSessions: stats.highRiskSessions,
    openSessions: stats.openSessions,
    totalSessions: stats.totalSessions,
    onCreateSession: () => setShowCreateSessionModal(true),
    onOpenHelp: () => router.push("/help" as any),
    onOpenSessions: () => router.push("/supervisor/sessions" as any),
    onOpenSyncConflicts: () => router.push("/supervisor/sync-conflicts" as any),
    onOpenVariances: () => router.push("/supervisor/variances" as any),
    onOpenWorkflows: () => router.push("/supervisor/user-workflows" as any),
  });

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
      backgroundType="aurora"
      statusBarStyle="light"
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
          <SupervisorOverviewCard
            completionPercentage={completionPercentage}
            highRiskSessions={stats.highRiskSessions}
            openSessions={stats.openSessions}
            overviewActions={overviewActions}
          />

          <SupervisorStatsSection
            completionPercentage={completionPercentage}
            onStatPress={handleStatPress}
            stats={stats}
          />

          <GlassCard style={styles.recommendationsCard} variant="strong">
            <View style={styles.recommendationsHeader}>
              <Ionicons
                name="bulb-outline"
                size={18}
                color={theme.colors.primary[400]}
              />
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
                    <Ionicons
                      name={action.icon}
                      size={16}
                      color={theme.colors.primary[400]}
                    />
                  </View>
                  <View style={styles.recommendationCopy}>
                    <Text style={styles.recommendationTitle}>{action.title}</Text>
                    <Text style={styles.recommendationDescription}>
                      {action.description}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={theme.colors.text.tertiary}
                  />
                </AnimatedPressable>
              ))}
            </View>
          </GlassCard>

          <SupervisorActivitySection
            activities={activities}
            onOpenActivity={(activityId) =>
              router.push(`/supervisor/session/${activityId}` as any)
            }
            onViewAll={() => router.push("/supervisor/activity-logs" as any)}
          />

          <SupervisorRecentSessionsSection
            onOpenSession={(sessionId) =>
              router.push(`/supervisor/session/${sessionId}` as any)
            }
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

      <SpeedDialMenu actions={speedDialActions} position="bottom-right" />
    </ScreenContainer>
  );
}

interface RecommendedActionItem {
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  key: string;
  onPress: () => void;
  title: string;
}

function buildRecommendedActions({
  completionPercentage,
  highRiskSessions,
  onCreateSession,
  onOpenHelp,
  onOpenSessions,
  onOpenSyncConflicts,
  onOpenVariances,
  onOpenWorkflows,
  openSessions,
  totalSessions,
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
      description:
        "Completion is below 70%. Review open sessions and clear pending items.",
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
    padding: theme.spacing.lg,
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
  recommendationsCard: {
    marginBottom: theme.spacing.xl,
    padding: theme.spacing.lg,
  },
  recommendationsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  recommendationsTitle: {
    color: theme.colors.text.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  recommendationsList: {
    gap: theme.spacing.sm,
  },
  recommendationAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  recommendationIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(59, 130, 246, 0.14)",
  },
  recommendationCopy: {
    flex: 1,
    gap: 2,
  },
  recommendationTitle: {
    color: theme.colors.text.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  recommendationDescription: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  bottomSpacer: {
    height: 100,
  },
});
