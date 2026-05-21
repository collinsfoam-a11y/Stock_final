/**
 * Activity Logs Screen - View application activity and audit logs
 * Refactored to use Aurora Design System
 */

import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator, RefreshControl, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { FlashList } from "@shopify/flash-list";

import { getActivityLogs, getActivityStats } from "../../src/services/api/api";
import { useToast } from "../../src/components/feedback/ToastProvider";
import {
  AnimatedPressable,
  OPERATIONAL_LIST_ROW_ESTIMATED_HEIGHT,
  OperationalListRow,
  OperationalListSection,
  ScreenContainer,
  StatsCard,
} from "../../src/components/ui";
import type { OperationalListRowSeverity, OperationalListRowTone } from "../../src/components/ui";
import { safeBackNavigation } from "@/utils/navigation";
import { useUiTokens } from "@/hooks/useUiTokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { colorWithAlpha } from "@/theme/themeTokens";
import {
  createOperationalStyleBridge,
  type OperationalStyleBridge,
} from "@/theme/operationalStyleBridge";

interface ActivityLog {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  details: any;
  status: string;
  error_message?: string;
}

const getLogTone = (status?: string): OperationalListRowTone => {
  switch (String(status || "").toLowerCase()) {
    case "success":
      return "success";
    case "error":
    case "failed":
      return "error";
    case "warning":
    case "warn":
      return "warning";
    default:
      return "info";
  }
};

const getLogSeverity = (status?: string): OperationalListRowSeverity => {
  switch (String(status || "").toLowerCase()) {
    case "error":
    case "failed":
      return "high";
    case "warning":
    case "warn":
      return "medium";
    default:
      return "low";
  }
};

export default function ActivityLogsScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();
  const operationalTheme = useMemo(() => createOperationalStyleBridge(uiTokens), [uiTokens]);
  const styles = useMemo(() => createStyles(operationalTheme), [operationalTheme]);
  const { show } = useToast();

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const statsEntry = prefersReducedMotion ? undefined : FadeInDown.delay(200).springify();

  const loadLogs = React.useCallback(
    async (pageNum: number = 1) => {
      try {
        setLoading(pageNum === 1);
        const response = await getActivityLogs(pageNum, 20);
        if (pageNum === 1) {
          setLogs(response.activities || []);
        } else {
          setLogs((prevLogs) => [...prevLogs, ...(response.activities || [])]);
        }
        setHasMore(response.pagination?.has_next || false);
      } catch (error: any) {
        show(`Failed to load logs: ${error.message}`, "error");
        if (Platform.OS !== "web")
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [show]
  );

  const loadStats = React.useCallback(async () => {
    try {
      const statsData = await getActivityStats();
      setStats(statsData);
    } catch (error: any) {
      console.error("Failed to load stats:", error);
    }
  }, []);

  useEffect(() => {
    loadLogs();
    loadStats();
  }, [loadLogs, loadStats]);

  const handleRefresh = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    setPage(1);
    loadLogs(1);
    loadStats();
  };

  const loadMore = () => {
    if (hasMore && !loading) {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      const nextPage = page + 1;
      setPage(nextPage);
      loadLogs(nextPage);
    }
  };

  const formatTimestamp = React.useCallback((timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }, []);

  const getActionIcon = React.useCallback((action: string) => {
    const iconMap: Record<string, string> = {
      login: "log-in-outline",
      logout: "log-out-outline",
      scan_item: "barcode-outline",
      create_session: "add-circle-outline",
      approve_count: "checkmark-circle-outline",
      reject_count: "close-circle-outline",
      refresh_stock: "refresh-outline",
      sync: "sync-outline",
    };
    return iconMap[action] || "ellipse-outline";
  }, []);

  const renderLogItem = React.useCallback(
    ({ item: log }: { item: ActivityLog }) => {
      const actionLabel = log.action.replace(/_/g, " ").toUpperCase();
      const details =
        Object.keys(log.details || {}).length > 0 && !log.error_message
          ? `Details ${JSON.stringify(log.details)}`
          : null;
      const entity = log.entity_type ? `${log.entity_type}: ${log.entity_id || "N/A"}` : null;

      return (
        <OperationalListRow
          title={actionLabel}
          subtitle={`${log.user} - ${log.role}`}
          metadata={[entity, details].filter(Boolean) as string[]}
          status={String(log.status || "info").toUpperCase()}
          statusTone={getLogTone(log.status)}
          severity={getLogSeverity(log.status)}
          leftIcon={getActionIcon(log.action) as keyof typeof Ionicons.glyphMap}
          timestamps={{
            label: "Logged",
            value: formatTimestamp(log.timestamp),
            icon: "time-outline",
          }}
          error={log.error_message ? log.error_message : false}
          accessibility={{
            label: `${actionLabel}, ${log.status}, ${log.user}, ${formatTimestamp(log.timestamp)}`,
          }}
          style={styles.rowSpacing}
        />
      );
    },
    [formatTimestamp, getActionIcon, styles.rowSpacing]
  );

  return (
    <ScreenContainer
      header={{
        title: "Activity Logs",
        subtitle: "System audit & user actions",
        toolbar: stats ? (
          <Animated.View entering={statsEntry} style={styles.statsContainer}>
            <StatsCard
              title="Total Activities"
              value={stats.total?.toString() || "0"}
              icon="layers-outline"
              variant="primary"
              style={{ flex: 1 }}
            />
            <StatsCard
              title="Success Rate"
              value={`${stats.by_status?.success || 0}`}
              icon="checkmark-circle-outline"
              variant="success"
              style={{ flex: 1 }}
            />
            <StatsCard
              title="Errors"
              value={`${stats.by_status?.error || 0}`}
              icon="alert-circle-outline"
              variant="error"
              style={{ flex: 1 }}
            />
          </Animated.View>
        ) : undefined,
      }}
    >
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.listContainer}>
          {loading && logs.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={operationalTheme.colors.primary[500]} />
              <Text style={styles.loadingText}>Loading activity logs...</Text>
            </View>
          ) : (
            <OperationalListSection
              title="Activity stream"
              subtitle={`${logs.length} loaded audit events`}
              severity={stats?.by_status?.error ? "high" : "none"}
              style={styles.listSection}
              contentStyle={styles.sectionListContent}
            >
              <FlashList
                data={logs}
                renderItem={renderLogItem}
                drawDistance={OPERATIONAL_LIST_ROW_ESTIMATED_HEIGHT.standard * 6}
                keyExtractor={(item) => item.id}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    tintColor={operationalTheme.colors.primary[500]}
                  />
                }
                onEndReached={loadMore}
                onEndReachedThreshold={0.5}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons
                      name="document-text-outline"
                      size={64}
                      color={operationalTheme.colors.text.tertiary}
                    />
                    <Text style={styles.emptyText}>No activity logs found</Text>
                  </View>
                }
                ListFooterComponent={
                  loading && logs.length > 0 ? (
                    <View style={styles.footerLoader}>
                      <ActivityIndicator color={operationalTheme.colors.primary[500]} />
                    </View>
                  ) : null
                }
                contentContainerStyle={styles.listContent}
              />
            </OperationalListSection>
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}

const createStyles = (operationalTheme: OperationalStyleBridge) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: operationalTheme.colors.background.primary,
    },
    container: {
      flex: 1,
      paddingTop: 60,
      paddingHorizontal: operationalTheme.spacing.md,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: operationalTheme.spacing.md,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: operationalTheme.spacing.md,
    },
    backButton: {
      padding: operationalTheme.spacing.xs,
      backgroundColor: operationalTheme.colors.background.glass,
      borderRadius: operationalTheme.borderRadius.full,
      borderWidth: 1,
      borderColor: operationalTheme.colors.border.light,
    },
    pageTitle: {
      fontFamily: operationalTheme.typography.fontFamily.heading,
      fontSize: operationalTheme.typography.fontSize["2xl"],
      color: operationalTheme.colors.text.primary,
      fontWeight: "700",
    },
    pageSubtitle: {
      fontSize: operationalTheme.typography.fontSize.sm,
      color: operationalTheme.colors.text.secondary,
    },
    statsContainer: {
      flexDirection: "row",
      gap: operationalTheme.spacing.sm,
      marginBottom: operationalTheme.spacing.md,
    },
    listContainer: {
      flex: 1,
    },
    listSection: {
      flex: 1,
      minHeight: 260,
    },
    sectionListContent: {
      flex: 1,
    },
    listContent: {
      paddingBottom: operationalTheme.spacing.xl,
    },
    rowSpacing: {
      marginBottom: operationalTheme.spacing.sm,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    loadingText: {
      marginTop: operationalTheme.spacing.md,
      color: operationalTheme.colors.text.secondary,
      fontSize: operationalTheme.typography.fontSize.md,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingTop: 100,
    },
    emptyText: {
      marginTop: operationalTheme.spacing.md,
      color: operationalTheme.colors.text.tertiary,
      fontSize: operationalTheme.typography.fontSize.lg,
    },
    logHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: operationalTheme.spacing.sm,
    },
    logHeaderLeft: {
      flexDirection: "row",
      gap: operationalTheme.spacing.md,
      flex: 1,
    },
    iconContainer: {
      width: 36,
      height: 36,
      borderRadius: operationalTheme.borderRadius.full,
      justifyContent: "center",
      alignItems: "center",
    },
    logInfo: {
      flex: 1,
    },
    logAction: {
      fontSize: operationalTheme.typography.fontSize.md,
      fontWeight: "700",
      color: operationalTheme.colors.text.primary,
      marginBottom: operationalTheme.spacing.xxs,
    },
    logUser: {
      fontSize: operationalTheme.typography.fontSize.xs,
      color: operationalTheme.colors.text.tertiary,
    },
    statusText: {
      fontSize: operationalTheme.typography.fontSize.xs,
      fontWeight: "bold",
      textTransform: "uppercase",
    },
    timestamp: {
      fontSize: operationalTheme.typography.fontSize.xs,
      color: operationalTheme.colors.text.tertiary,
      marginBottom: operationalTheme.spacing.xs,
      marginLeft: 52, // Align with text, skipping icon
    },
    entityBadge: {
      alignSelf: "flex-start",
      marginVertical: operationalTheme.spacing.xs,
    },
    errorCard: {
      marginTop: operationalTheme.spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: operationalTheme.spacing.sm,
      borderColor: operationalTheme.colors.error[500],
      backgroundColor: colorWithAlpha(operationalTheme.colors.error[500], 0.1),
    },
    detailsCard: {
      marginTop: operationalTheme.spacing.sm,
    },
    footerLoader: {
      padding: operationalTheme.spacing.xl,
    },
    entityText: {
      fontSize: operationalTheme.typography.fontSize.xs,
      color: operationalTheme.colors.text.secondary,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    errorText: {
      fontSize: operationalTheme.typography.fontSize.xs,
      flex: 1,
    },
    detailsText: {
      fontSize: operationalTheme.typography.fontSize.xs,
      color: operationalTheme.colors.text.secondary,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
  });
