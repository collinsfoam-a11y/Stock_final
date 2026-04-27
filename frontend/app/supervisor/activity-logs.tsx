/**
 * Activity Logs Screen - View application activity and audit logs
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getActivityLogs, getActivityStats } from "../../src/services/api/api";
import { useToast } from "../../src/components/feedback/ToastProvider";
import { AnimatedPressable } from "../../src/components/ui/AnimatedPressable";
import { ModernCard } from "../../src/components/ui/ModernCard";
import { ScreenContainer } from "../../src/components/ui/ScreenContainer";
import { useThemeContext } from "../../src/context/ThemeContext";

interface ActivityLog {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  details: Record<string, unknown>;
  status: string;
  error_message?: string;
}

const getActionIcon = (action: string) => {
  const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
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
};

const formatTimestamp = (timestamp: string) => new Date(timestamp).toLocaleString();

export default function ActivityLogsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { show } = useToast();
  const { theme, themeLegacy, isDark } = useThemeContext();

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const styles = useMemo(
    () => createStyles(theme, themeLegacy, insets.top),
    [theme, themeLegacy, insets.top],
  );

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
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [show],
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
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setRefreshing(true);
    setPage(1);
    loadLogs(1);
    loadStats();
  };

  const loadMore = () => {
    if (hasMore && !loading) {
      if (Platform.OS !== "web") {
        Haptics.selectionAsync();
      }
      const nextPage = page + 1;
      setPage(nextPage);
      loadLogs(nextPage);
    }
  };

  const renderStatCard = (
    title: string,
    value: string,
    icon: keyof typeof Ionicons.glyphMap,
    color: string,
    accentBackground: string,
  ) => (
    <ModernCard variant="elevated" style={styles.statCard}>
      <View style={styles.statHeader}>
        <View style={[styles.statIcon, { backgroundColor: accentBackground }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <Text style={styles.statLabel}>{title}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </ModernCard>
  );

  const renderLogItem = ({ item: log }: { item: ActivityLog }) => {
    const isError = log.status === "error";
    const isSuccess = log.status === "success";
    const statusColor = isSuccess
      ? theme.colors.success.main
      : isError
        ? theme.colors.error.main
        : theme.colors.warning.main;
    const iconBackground = isError
      ? theme.colors.error.light
      : themeLegacy.colors.overlayPrimary;
    const details = Object.keys(log.details || {}).length > 0
      ? JSON.stringify(log.details, null, 2)
      : "";

    return (
      <View style={styles.logItem}>
        <ModernCard variant="elevated" padding={themeLegacy.spacing.md}>
          <View style={styles.logHeader}>
            <View style={styles.logHeaderLeft}>
              <View style={[styles.iconContainer, { backgroundColor: iconBackground }]}>
                <Ionicons
                  name={getActionIcon(log.action)}
                  size={20}
                  color={isError ? theme.colors.error.main : theme.colors.primary[500]}
                />
              </View>
              <View style={styles.logInfo}>
                <Text style={styles.logAction}>
                  {log.action.replace(/_/g, " ").toUpperCase()}
                </Text>
                <Text style={styles.logUser}>
                  {log.user} • {log.role}
                </Text>
              </View>
            </View>
            <Text style={[styles.statusText, { color: statusColor }]}>{log.status}</Text>
          </View>

          <Text style={styles.timestamp}>{formatTimestamp(log.timestamp)}</Text>

          {log.entity_type ? (
            <ModernCard
              variant="outlined"
              padding={themeLegacy.spacing.xs}
              style={styles.metaCard}
            >
              <Text style={styles.entityText}>
                {log.entity_type}: {log.entity_id || "N/A"}
              </Text>
            </ModernCard>
          ) : null}

          {log.error_message ? (
            <ModernCard
              variant="outlined"
              padding={themeLegacy.spacing.sm}
              style={styles.errorCard}
              contentStyle={styles.errorCardContent}
            >
              <Ionicons
                name="alert-circle"
                size={16}
                color={theme.colors.error.main}
              />
              <Text style={styles.errorText}>{log.error_message}</Text>
            </ModernCard>
          ) : null}

          {details && !log.error_message ? (
            <ModernCard
              variant="outlined"
              padding={themeLegacy.spacing.sm}
              style={styles.detailsCard}
            >
              <Text style={styles.detailsText} numberOfLines={3}>
                {details}
              </Text>
            </ModernCard>
          ) : null}
        </ModernCard>
      </View>
    );
  };

  return (
    <ScreenContainer
      backgroundType="solid"
      noPadding
      statusBarStyle={isDark ? "light-content" : "dark-content"}
    >
      <View style={styles.container}>
        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
          <View style={styles.headerLeft}>
            <AnimatedPressable onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color={theme.colors.text.primary} />
            </AnimatedPressable>
            <View>
              <Text style={styles.pageTitle}>Activity Logs</Text>
              <Text style={styles.pageSubtitle}>System audit and user actions</Text>
            </View>
          </View>
        </Animated.View>

        {stats ? (
          <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.statsContainer}>
            {renderStatCard(
              "Total Activities",
              String(stats.total || 0),
              "layers-outline",
              theme.colors.primary[500],
              themeLegacy.colors.overlayPrimary,
            )}
            {renderStatCard(
              "Success Rate",
              String(stats.by_status?.success || 0),
              "checkmark-circle-outline",
              theme.colors.success.main,
              theme.colors.success.light,
            )}
            {renderStatCard(
              "Errors",
              String(stats.by_status?.error || 0),
              "alert-circle-outline",
              theme.colors.error.main,
              theme.colors.error.light,
            )}
          </Animated.View>
        ) : null}

        <View style={styles.listContainer}>
          {loading && logs.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary[500]} />
              <Text style={styles.loadingText}>Loading activity logs...</Text>
            </View>
          ) : (
            <FlashList
              data={logs}
              renderItem={renderLogItem}
              // @ts-ignore
              estimatedItemSize={180}
              keyExtractor={(item) => item.id}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={theme.colors.primary[500]}
                />
              }
              onEndReached={loadMore}
              onEndReachedThreshold={0.5}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons
                    name="document-text-outline"
                    size={64}
                    color={theme.colors.text.tertiary}
                  />
                  <Text style={styles.emptyText}>No activity logs found</Text>
                </View>
              }
              ListFooterComponent={
                loading && logs.length > 0 ? (
                  <View style={styles.footerLoader}>
                    <ActivityIndicator color={theme.colors.primary[500]} />
                  </View>
                ) : null
              }
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}

const createStyles = (
  theme: ReturnType<typeof useThemeContext>["theme"],
  themeLegacy: ReturnType<typeof useThemeContext>["themeLegacy"],
  topInset: number,
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: topInset + themeLegacy.spacing.md,
      paddingHorizontal: themeLegacy.spacing.md,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: themeLegacy.spacing.md,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: themeLegacy.spacing.md,
    },
    backButton: {
      padding: themeLegacy.spacing.xs,
      backgroundColor: theme.colors.background.elevated,
      borderRadius: theme.borderRadius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border.light,
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    pageTitle: {
      fontFamily: theme.typography.fontFamily.heading,
      fontSize: themeLegacy.typography.fontSize.xxl,
      color: theme.colors.text.primary,
      fontWeight: "700",
    },
    pageSubtitle: {
      fontSize: themeLegacy.typography.fontSize.sm,
      color: theme.colors.text.secondary,
    },
    statsContainer: {
      flexDirection: "row",
      gap: themeLegacy.spacing.sm,
      marginBottom: themeLegacy.spacing.md,
    },
    statCard: {
      flex: 1,
      minHeight: 108,
    },
    statHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: themeLegacy.spacing.sm,
      marginBottom: themeLegacy.spacing.md,
    },
    statIcon: {
      width: 32,
      height: 32,
      borderRadius: theme.borderRadius.full,
      alignItems: "center",
      justifyContent: "center",
    },
    statLabel: {
      flex: 1,
      fontSize: themeLegacy.typography.fontSize.xs,
      color: theme.colors.text.secondary,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    statValue: {
      fontSize: themeLegacy.typography.fontSize.xxl,
      color: theme.colors.text.primary,
      fontWeight: "700",
      fontFamily: theme.typography.fontFamily.heading,
    },
    listContainer: {
      flex: 1,
    },
    listContent: {
      paddingBottom: themeLegacy.spacing.xl,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    loadingText: {
      marginTop: themeLegacy.spacing.md,
      color: theme.colors.text.secondary,
      fontSize: themeLegacy.typography.fontSize.md,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingTop: 100,
    },
    emptyText: {
      marginTop: themeLegacy.spacing.md,
      color: theme.colors.text.tertiary,
      fontSize: themeLegacy.typography.fontSize.lg,
    },
    footerLoader: {
      padding: 20,
    },
    logItem: {
      marginBottom: themeLegacy.spacing.md,
    },
    logHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: themeLegacy.spacing.sm,
    },
    logHeaderLeft: {
      flexDirection: "row",
      gap: themeLegacy.spacing.md,
      flex: 1,
    },
    iconContainer: {
      width: 36,
      height: 36,
      borderRadius: theme.borderRadius.full,
      justifyContent: "center",
      alignItems: "center",
    },
    logInfo: {
      flex: 1,
    },
    logAction: {
      fontSize: themeLegacy.typography.fontSize.md,
      fontWeight: "700",
      color: theme.colors.text.primary,
      marginBottom: 2,
    },
    logUser: {
      fontSize: themeLegacy.typography.fontSize.xs,
      color: theme.colors.text.tertiary,
    },
    statusText: {
      fontSize: themeLegacy.typography.fontSize.xs,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    timestamp: {
      fontSize: themeLegacy.typography.fontSize.xs,
      color: theme.colors.text.tertiary,
      marginBottom: themeLegacy.spacing.xs,
      marginLeft: 52,
    },
    metaCard: {
      alignSelf: "flex-start",
      marginVertical: themeLegacy.spacing.xs,
    },
    entityText: {
      fontSize: themeLegacy.typography.fontSize.xs,
      color: theme.colors.text.secondary,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    errorCard: {
      marginTop: themeLegacy.spacing.sm,
      borderColor: theme.colors.error.main,
      backgroundColor: theme.colors.error.light,
    },
    errorCardContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: themeLegacy.spacing.sm,
    },
    errorText: {
      fontSize: themeLegacy.typography.fontSize.xs,
      flex: 1,
      color: theme.colors.error.main,
    },
    detailsCard: {
      marginTop: themeLegacy.spacing.sm,
    },
    detailsText: {
      fontSize: themeLegacy.typography.fontSize.xs,
      color: theme.colors.text.secondary,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
  });
