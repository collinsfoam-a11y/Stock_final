/**
 * Sessions List Screen
 * Displays a paginated list of all stock verification sessions.
 * Refactored to use Aurora Design System
 */

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, RefreshControl, Platform } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FlashList } from "@shopify/flash-list";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { getSessions } from "@/services/api/api";
import { ModernCard, AnimatedPressable, ScreenContainer } from "@/components/ui";
import { useSettingsStore } from "@/store/settingsStore";
import { theme } from "@/styles/unifiedSystem";
import { useUiTokens } from "@/hooks/useUiTokens";
import { useToast } from "@/components/feedback/ToastProvider";
import { safeBackNavigation } from "@/utils/navigation";

export default function SessionsList() {
  const router = useRouter();
  const { show } = useToast();
  const uiTokens = useUiTokens();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadSessions = useCallback(
    async (pageNum: number, shouldRefresh = false) => {
      try {
        if (pageNum === 1) setLoading(true);

        const response = await getSessions(pageNum, 20);
        const newSessions = response.items || [];
        const pagination = response.pagination;

        if (shouldRefresh) {
          setSessions(newSessions);
        } else {
          setSessions((prev) => [...prev, ...newSessions]);
        }

        setHasMore(pagination.has_next);
      } catch (error) {
        console.error("Failed to load sessions:", error);
        show("Failed to load sessions", "error");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [show]
  );

  useEffect(() => {
    loadSessions(1, true);
  }, [loadSessions]);

  const handleRefresh = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    setPage(1);
    loadSessions(1, true);
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      setLoadingMore(true);
      const nextPage = page + 1;
      setPage(nextPage);
      loadSessions(nextPage);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "OPEN":
        return uiTokens.colors.warning;
      case "CLOSED":
        return uiTokens.colors.success;
      case "RECONCILE":
        return uiTokens.colors.accent;
      default:
        return uiTokens.colors.textSecondary;
    }
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const statusColor = getStatusColor(item.status);
    const hasVariance = Math.abs(item.total_variance || 0) > 0;

    return (
      <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
        <AnimatedPressable
          onPress={() => router.push(`/supervisor/session/${item.id}` as any)}
          style={{ marginBottom: theme.spacing.md }}
        >
          <ModernCard variant="outlined" elevation="none" padding={theme.spacing.md} intensity={20}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.titleRow}>
                  <Ionicons name="business-outline" size={20} color={uiTokens.colors.accent} />
                  <Text style={[styles.warehouseName, { color: uiTokens.colors.textPrimary }]}>
                    {item.warehouse}
                  </Text>
                </View>
                <View style={styles.staffContainer}>
                  <Ionicons name="person-outline" size={14} color={uiTokens.colors.textSecondary} />
                  <Text style={[styles.staffName, { color: uiTokens.colors.textSecondary }]}>
                    {item.staff_name || "Unknown Staff"}
                  </Text>
                </View>
                {item.barcode ? (
                  <View style={styles.barcodeContainer}>
                    <Ionicons
                      name="barcode-outline"
                      size={14}
                      color={uiTokens.colors.textSecondary}
                    />
                    <Text style={[styles.barcodeText, { color: uiTokens.colors.textSecondary }]}>
                      {item.barcode}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: statusColor + "20",
                    borderColor: statusColor,
                  },
                ]}
              >
                <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
              </View>
            </View>

            <View style={[styles.cardBody, { borderTopColor: uiTokens.colors.border }]}>
              <View style={styles.statItem}>
                <Ionicons name="cube-outline" size={16} color={uiTokens.colors.textSecondary} />
                <Text style={[styles.statText, { color: uiTokens.colors.textSecondary }]}>
                  {item.total_items} Items
                </Text>
              </View>

              <View style={styles.statItem}>
                <Ionicons
                  name="analytics-outline"
                  size={16}
                  color={hasVariance ? uiTokens.colors.error : uiTokens.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.statText,
                    { color: uiTokens.colors.textSecondary },
                    hasVariance && {
                      color: uiTokens.colors.error,
                    },
                  ]}
                >
                  Var: {item.total_variance?.toFixed(2) || "0.00"}
                </Text>
              </View>

              <View style={[styles.statItem, { marginLeft: "auto" }]}>
                <Text style={[styles.dateText, { color: uiTokens.colors.textSecondary }]}>
                  {(() => {
                    const raw = item.started_at || item.created_at;
                    const parsed = raw ? new Date(raw) : null;
                    return parsed && !Number.isNaN(parsed.getTime())
                      ? parsed.toLocaleDateString()
                      : "—";
                  })()}
                </Text>
              </View>
            </View>
          </ModernCard>
        </AnimatedPressable>
      </Animated.View>
    );
  };

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
          color={offlineMode ? uiTokens.colors.warning : uiTokens.colors.textSecondary}
          style={{ opacity: 0.5 }}
        />
        <Text style={[styles.emptyText, { color: uiTokens.colors.textSecondary }]}>
          {offlineMode ? "No cached sessions available" : "No sessions found"}
        </Text>
      </ModernCard>
    </View>
  );

  const renderFooter = () => {
    if (!loadingMore) return <View style={{ height: 20 }} />;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator color={uiTokens.colors.accent} />
      </View>
    );
  };

  return (
    <ScreenContainer>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
          <View style={styles.headerLeft}>
            <AnimatedPressable
              onPress={() => safeBackNavigation(router, { userRole: "supervisor" })}
              style={[
                styles.backButton,
                { backgroundColor: uiTokens.colors.surface, borderColor: uiTokens.colors.border },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={24} color={uiTokens.colors.textPrimary} />
            </AnimatedPressable>
            <View>
              <Text style={[styles.pageTitle, { color: uiTokens.colors.textPrimary }]}>
                All Sessions
              </Text>
              <Text style={[styles.pageSubtitle, { color: uiTokens.colors.textSecondary }]}>
                {offlineMode ? "Cached session history" : "Stock Verification History"}
              </Text>
            </View>
          </View>
          <AnimatedPressable
            onPress={handleRefresh}
            style={[styles.refreshButton, { backgroundColor: uiTokens.colors.surface }]}
            accessibilityRole="button"
            accessibilityLabel="Refresh"
          >
            <Ionicons name="refresh" size={24} color={uiTokens.colors.accent} />
          </AnimatedPressable>
        </Animated.View>

        {offlineMode && (
          <Animated.View entering={FadeInDown.delay(140).springify()} style={styles.noticeWrap}>
            <ModernCard
              variant="outlined"
              elevation="none"
              padding={theme.spacing.md}
              intensity={15}
            >
              <View style={styles.noticeRow}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={18}
                  color={uiTokens.colors.warning}
                />
                <View style={styles.noticeCopy}>
                  <Text style={[styles.noticeTitle, { color: uiTokens.colors.textPrimary }]}>
                    Showing cached sessions only
                  </Text>
                  <Text style={[styles.noticeText, { color: uiTokens.colors.textSecondary }]}>
                    You can review locally cached session data offline. Live status changes and
                    server refresh still require a connection.
                  </Text>
                </View>
              </View>
            </ModernCard>
          </Animated.View>
        )}

        {loading && !refreshing ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={uiTokens.colors.accent} />
          </View>
        ) : (
          <View style={styles.listContainer}>
            <FlashList
              data={sessions}
              renderItem={renderItem}
              // @ts-ignore
              estimatedItemSize={140}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={uiTokens.colors.accent}
                />
              }
              ListEmptyComponent={renderEmpty}
              ListFooterComponent={renderFooter}
              contentContainerStyle={styles.listContent}
            />
          </View>
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
    marginBottom: theme.spacing.md,
  },
  noticeWrap: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  noticeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
  },
  noticeCopy: {
    flex: 1,
    gap: 4,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 18,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  backButton: {
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  pageTitle: {
    fontSize: 32,
  },
  pageSubtitle: {
    fontSize: 14,
  },
  refreshButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  listContent: {
    paddingBottom: 40,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: theme.spacing.md,
  },
  cardHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  warehouseName: {
    fontSize: 20,
  },
  staffContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  staffName: {
    fontSize: 14,
  },
  barcodeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  barcodeText: {
    fontSize: 12,
    fontFamily: "monospace",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statText: {
    fontSize: 14,
  },
  dateText: {
    fontSize: 12,
    opacity: 0.7,
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
  },
  footerLoader: {
    paddingVertical: theme.spacing.md,
    alignItems: "center",
  },
});
