/**
 * Sessions List Screen
 * Displays a paginated list of all stock verification sessions.
 * Refactored to use Aurora Design System
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FlashList } from "@shopify/flash-list";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { getSessions } from "../../src/services/api/api";
import {
  ModernCard,
  AnimatedPressable,
  ScreenContainer,
  InlineAlert,
  SyncStatusPill,
  OperationalCommandBar,
  OperationalListRow,
  OperationalListSection,
  OperationalSplitView,
  OperationalStatusStrip,
  OPERATIONAL_LIST_ROW_ESTIMATED_HEIGHT,
} from "../../src/components/ui";
import type {
  OperationalCommandAction,
  OperationalListRowSeverity,
  OperationalListRowTone,
} from "../../src/components/ui";
import { useSettingsStore } from "../../src/store/settingsStore";
import { theme } from "../../src/styles/unifiedSystem";
import { useToast } from "../../src/components/feedback/ToastProvider";
import { OperationalSyncBanner } from "../../src/components/feedback";
import { safeBackNavigation } from "@/utils/navigation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useOperationalQueueNavigation } from "@/hooks/useOperationalQueueNavigation";
import { BREAKPOINTS } from "@/hooks/useResponsive";
import { useUiTokens } from "../../src/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";

const getSessionStatusTone = (status?: string): OperationalListRowTone => {
  switch (String(status || "").trim().toUpperCase()) {
    case "OPEN":
    case "ACTIVE":
      return "active";
    case "CLOSED":
    case "COMPLETED":
    case "FINALIZED":
      return "completed";
    case "RECONCILE":
    case "PENDING":
      return "variance";
    case "FAILED":
    case "REJECTED":
      return "error";
    default:
      return "neutral";
  }
};

const getSessionSeverity = (status: string | undefined, variance: number): OperationalListRowSeverity => {
  if (Math.abs(variance) > 0) return "high";

  switch (String(status || "").trim().toUpperCase()) {
    case "RECONCILE":
      return "medium";
    case "FAILED":
    case "REJECTED":
      return "critical";
    case "OPEN":
    case "ACTIVE":
      return "low";
    default:
      return "none";
  }
};

const formatSessionDate = (value?: string) => {
  if (!value) return "Unknown date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleDateString();
};

export default function SessionsList() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const uiTokens = useUiTokens();
  const { show } = useToast();
  const prefersReducedMotion = useReducedMotion();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);

  const loadSessions = useCallback(
    async (pageNum: number, shouldRefresh = false) => {
      try {
        if (pageNum === 1) setLoading(true);
        setLoadError(null);

        const response = await getSessions(pageNum, 20);
        const newSessions = response.items || [];
        const pagination = response.pagination;

        if (shouldRefresh) {
          setSessions(newSessions);
          setSelectedSession((current: any | null) => current ?? newSessions[0] ?? null);
        } else {
          setSessions((prev) => [...prev, ...newSessions]);
        }

        setHasMore(pagination.has_next);
      } catch (error) {
        console.error("Failed to load sessions:", error);
        const message = offlineMode
          ? "Cached sessions could not load. Check local storage and retry."
          : "Sessions could not refresh. Check connection and retry.";
        setLoadError(message);
        show(message, "error");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [offlineMode, show]
  );

  useEffect(() => {
    loadSessions(1, true);
  }, [loadSessions]);

  const handleRefresh = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    setPage(1);
    loadSessions(1, true);
  }, [loadSessions]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      setLoadingMore(true);
      const nextPage = page + 1;
      setPage(nextPage);
      loadSessions(nextPage);
    }
  };

  const renderItem = useCallback(
    ({ item, index }: { item: any; index: number }) => {
      const variance = Number(item.total_variance || 0);
      const hasVariance = Math.abs(variance) > 0;
      const warehouse = item.warehouse || "Unknown warehouse";
      const staffName = item.staff_name || "Unknown staff";
      const totalItems = Number(item.total_items || 0);
      const status = item.status || "Unknown";
      const sessionShortId = item.id ? String(item.id).slice(-8).toUpperCase() : "N/A";

      return (
        <OperationalListRow
          title={warehouse}
          subtitle={`Staff: ${staffName}`}
          metadata={[
            `Session ${sessionShortId}`,
            ...(item.barcode ? [`Barcode ${item.barcode}`] : []),
          ]}
          metrics={[
            { label: "Items", value: totalItems, tone: "info", icon: "cube-outline" },
            {
              label: "Var",
              value: variance.toFixed(2),
              tone: hasVariance ? "error" : "success",
              icon: "analytics-outline",
              accessibilityLabel: `Variance ${variance.toFixed(2)}`,
            },
          ]}
          status={status}
          statusTone={getSessionStatusTone(status)}
          severity={getSessionSeverity(status, variance)}
          leftIcon="business-outline"
          badges={
            hasVariance
              ? [
                  {
                    label: "Variance",
                    tone: "error",
                    icon: "analytics-outline",
                    accessibilityLabel: `Variance ${variance.toFixed(2)}`,
                  },
                ]
              : []
          }
          timestamps={[
            {
              label: "Created",
              value: formatSessionDate(item.created_at),
              icon: "calendar-outline",
            },
          ]}
          accessibility={{
            label: `Open session for ${warehouse}. Staff ${staffName}. Status ${status}. ${totalItems} items. Variance ${variance.toFixed(2)}.`,
            hint: "Opens the session detail screen",
          }}
          enteringDelay={Math.min(index, 4) * 35}
          selected={selectedSession?.id === item.id}
          onPress={() => {
            setSelectedSession(item);
            if (width < BREAKPOINTS.tablet) {
              router.push(`/supervisor/session/${item.id}` as any);
            }
          }}
          onKeyboardOpen={() => router.push(`/supervisor/session/${item.id}` as any)}
          style={styles.sessionRow}
        />
      );
    },
    [router, selectedSession?.id, width]
  );

  const getSessionId = useCallback((item: any) => String(item.id), []);
  const openSessionReview = useCallback(
    (item: any) => {
      router.push(`/supervisor/session/${item.id}` as any);
    },
    [router]
  );

  useOperationalQueueNavigation({
    items: sessions,
    selectedItem: selectedSession,
    getItemId: getSessionId,
    onSelect: setSelectedSession,
    onOpen: openSessionReview,
    onEscape: () => setSelectedSession(null),
    enabled: !loading,
  });

  const sessionsWithVariance = React.useMemo(
    () => sessions.filter((session) => Number(session.total_variance || 0) !== 0).length,
    [sessions]
  );

  const sessionCommandActions = useCallback<() => OperationalCommandAction[]>(
    () =>
      selectedSession
        ? [
            {
              id: "open-session",
              label: "Open Review",
              icon: "open-outline",
              tone: "primary",
              onPress: () => openSessionReview(selectedSession),
              accessibilityLabel: `Open session review for ${selectedSession.warehouse || "selected session"}`,
              accessibilityHint: "Opens the full supervisor session review workflow",
            },
            {
              id: "refresh-sessions",
              label: "Refresh",
              icon: "refresh-outline",
              tone: "secondary",
              shortcut: "Mod+R",
              onPress: handleRefresh,
              accessibilityLabel: "Refresh sessions",
              accessibilityHint: "Reloads the supervisor session queue",
            },
          ]
        : [
            {
              id: "refresh-sessions",
              label: "Refresh",
              icon: "refresh-outline",
              tone: "secondary",
              shortcut: "Mod+R",
              onPress: handleRefresh,
              accessibilityLabel: "Refresh sessions",
              accessibilityHint: "Reloads the supervisor session queue",
            },
          ],
    [handleRefresh, openSessionReview, selectedSession]
  );

  const sessionDetailPanel = React.useMemo(() => {
    if (!selectedSession) {
      return (
        <View style={styles.detailEmpty}>
          <Ionicons name="business-outline" size={48} color={theme.colors.text.tertiary} />
          <Text style={styles.detailEmptyTitle}>Select a session</Text>
          <Text style={styles.detailEmptyBody}>
            Pick a session row to keep review context beside the queue.
          </Text>
        </View>
      );
    }

    const variance = Number(selectedSession.total_variance || 0);
    const totalItems = Number(selectedSession.total_items || 0);

    return (
      <View style={styles.detailPanel}>
        <View>
          <Text style={styles.detailEyebrow}>Supervisor review</Text>
          <Text style={styles.detailTitle} numberOfLines={2}>
            {selectedSession.warehouse || "Unknown warehouse"}
          </Text>
          <Text style={styles.detailSubtitle} numberOfLines={1}>
            Staff: {selectedSession.staff_name || "Unknown staff"}
          </Text>
        </View>

        <View style={styles.detailMetricGrid}>
          <View style={styles.detailMetric}>
            <Text style={styles.detailMetricLabel}>Items</Text>
            <Text style={styles.detailMetricValue}>{totalItems}</Text>
          </View>
          <View style={styles.detailMetric}>
            <Text style={styles.detailMetricLabel}>Variance</Text>
            <Text
              style={[
                styles.detailMetricValue,
                variance !== 0 ? { color: theme.colors.warning[500] } : null,
              ]}
            >
              {variance.toFixed(2)}
            </Text>
          </View>
          <View style={styles.detailMetric}>
            <Text style={styles.detailMetricLabel}>Status</Text>
            <Text style={styles.detailMetricValue} numberOfLines={1}>
              {selectedSession.status || "N/A"}
            </Text>
          </View>
        </View>

        <View style={styles.detailMetaBlock}>
          <Text style={styles.detailMetaText}>
            Session: {selectedSession.id ? String(selectedSession.id).slice(-8).toUpperCase() : "N/A"}
          </Text>
          <Text style={styles.detailMetaText}>Created: {formatSessionDate(selectedSession.created_at)}</Text>
          {selectedSession.barcode ? (
            <Text style={styles.detailMetaText}>Barcode: {selectedSession.barcode}</Text>
          ) : null}
        </View>

        <OperationalCommandBar
          compact
          align="stretch"
          title="Review commands"
          subtitle="Enter opens review. Cmd/Ctrl+R refreshes session state."
          actions={sessionCommandActions()}
          style={styles.detailCommandBar}
        />
      </View>
    );
  }, [selectedSession, sessionCommandActions]);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <ModernCard
        variant="outlined"
        elevation="none"
        style={styles.emptyCard}
        padding={theme.spacing.xl}
        intensity={15}
      >
        <Ionicons
          name={offlineMode ? "cloud-offline-outline" : "cube-outline"}
          size={64}
          color={offlineMode ? theme.colors.warning.main : theme.colors.text.secondary}
          style={{ opacity: 0.5 }}
        />
        <Text style={styles.emptyText}>
          {offlineMode ? "No cached sessions available" : "No sessions found"}
        </Text>
      </ModernCard>
    </View>
  );

  const renderFooter = () => {
    if (!loadingMore) return <View style={{ height: 20 }} />;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator color={theme.colors.primary[500]} />
      </View>
    );
  };

  return (
    <ScreenContainer
      header={{
        title: "All Sessions",
        subtitle: offlineMode ? "Cached session history" : "Stock Verification History",
        customRightContent: (
          <View style={styles.headerActions}>
            <SyncStatusPill />
            <AnimatedPressable
              onPress={handleRefresh}
              style={styles.refreshButton}
              accessibilityLabel="Refresh sessions"
              accessibilityHint="Reloads the sessions list"
            >
              <Ionicons name="refresh" size={24} color={uiTokens.colors.accent} />
            </AnimatedPressable>
          </View>
        ),
        toolbar: (
          <OperationalStatusStrip
            compact
            offline={offlineMode}
            syncState={refreshing ? "Refreshing" : offlineMode ? "Cached" : "Ready"}
            pendingQueueCount={sessions.length}
            runtimeHealth={loadError ? "Degraded" : "Stable"}
            items={[
              {
                id: "variance-sessions",
                label: "Variance",
                value: sessionsWithVariance,
                tone: sessionsWithVariance > 0 ? "warning" : "success",
                icon: "analytics-outline",
              },
              selectedSession
                ? {
                    id: "active-session",
                    label: "Active",
                    value: String(selectedSession.warehouse || "Selected"),
                    tone: "active",
                    icon: "radio-button-on-outline",
                  }
                : undefined,
            ].filter(Boolean) as React.ComponentProps<typeof OperationalStatusStrip>["items"]}
            style={styles.statusStrip}
            testID="sessions-operational-status-strip"
          />
        ),
      }}
    >
      <StatusBar style="light" />
      <View style={styles.container}>
        {offlineMode && (
          <Animated.View
            entering={prefersReducedMotion ? undefined : FadeInDown.delay(140).springify()}
            style={styles.noticeWrap}
          >
            <OperationalSyncBanner
              compact
              tone="offline"
              title="Showing cached sessions only"
              message="You can review locally cached session data offline. Live status changes and server refresh still require a connection."
            />
          </Animated.View>
        )}

        {loadError && (
          <View style={styles.alertWrap}>
            <InlineAlert type="error" message={loadError} />
          </View>
        )}

        {loading && !refreshing ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary[500]} />
            <Text style={styles.loadingText}>
              {offlineMode ? "Loading cached sessions..." : "Loading sessions..."}
            </Text>
          </View>
        ) : (
          <OperationalSplitView
            collapsible
            persistSelection={false}
            sidebarLabel="Session queue"
            detailLabel={
              selectedSession
                ? `Session review for ${selectedSession.warehouse || selectedSession.id}`
                : "Session review"
            }
            style={styles.splitView}
            sidebar={
              <OperationalListSection
                title="Session queue"
                subtitle={`${sessions.length} loaded ${hasMore ? "with more available" : "total"}`}
                severity={sessions.some((session) => Number(session.total_variance || 0) !== 0) ? "high" : "none"}
                style={styles.listSection}
                contentStyle={styles.sectionListContent}
              >
                <FlashList
                  data={sessions}
                  renderItem={renderItem}
                  keyExtractor={(item) => String(item.id)}
                  drawDistance={OPERATIONAL_LIST_ROW_ESTIMATED_HEIGHT.standard * 6}
                  onEndReached={handleLoadMore}
                  onEndReachedThreshold={0.5}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={handleRefresh}
                      tintColor={theme.colors.primary[500]}
                    />
                  }
                  ListEmptyComponent={renderEmpty}
                  ListFooterComponent={renderFooter}
                  contentContainerStyle={styles.listContent}
                />
              </OperationalListSection>
            }
            detail={sessionDetailPanel}
          />
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  noticeWrap: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  backButton: {
    padding: theme.spacing.xs,
    backgroundColor: colorWithAlpha(theme.colors.text.primary, 0.1),
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: colorWithAlpha(theme.colors.text.primary, 0.1),
  },
  pageTitle: {
    fontSize: 32,
    color: theme.colors.text.primary,
  },
  pageSubtitle: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  refreshButton: {
    padding: theme.spacing.sm,
    backgroundColor: colorWithAlpha(theme.colors.text.primary, 0.1),
    borderRadius: theme.borderRadius.full,
    minHeight: theme.accessibility.minTouchTarget,
    minWidth: theme.accessibility.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  alertWrap: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  statusStrip: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  loadingText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
  },
  splitView: {
    flex: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  listSection: {
    flex: 1,
    minHeight: 260,
  },
  sectionListContent: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 40,
  },
  sessionRow: {
    marginBottom: theme.spacing.sm,
  },
  emptyContainer: {
    padding: theme.spacing.xl,
    alignItems: "center",
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    gap: theme.spacing.md,
  },
  emptyText: {
    fontSize: 24,
    color: theme.colors.text.secondary,
  },
  footerLoader: {
    paddingVertical: theme.spacing.md,
    alignItems: "center",
  },
  detailEmpty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.xl,
  },
  detailEmptyTitle: {
    color: theme.colors.text.primary,
    fontSize: 18,
    fontWeight: "800",
    marginTop: theme.spacing.md,
  },
  detailEmptyBody: {
    color: theme.colors.text.secondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: theme.spacing.xs,
  },
  detailPanel: {
    flex: 1,
    minHeight: 0,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  detailEyebrow: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: theme.spacing.xs,
  },
  detailTitle: {
    color: theme.colors.text.primary,
    fontSize: 22,
    fontWeight: "800",
  },
  detailSubtitle: {
    color: theme.colors.text.secondary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: theme.spacing.xs,
  },
  detailMetricGrid: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  detailMetric: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colorWithAlpha(theme.colors.text.primary, 0.1),
    backgroundColor: colorWithAlpha(theme.colors.text.primary, 0.04),
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
  },
  detailMetricLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: theme.spacing.xs,
  },
  detailMetricValue: {
    color: theme.colors.text.primary,
    fontSize: 18,
    fontWeight: "800",
  },
  detailMetaBlock: {
    borderWidth: 1,
    borderColor: colorWithAlpha(theme.colors.text.primary, 0.1),
    backgroundColor: colorWithAlpha(theme.colors.text.primary, 0.04),
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  detailMetaText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: "600",
  },
  detailCommandBar: {
    marginTop: theme.spacing.xs,
  },
});
