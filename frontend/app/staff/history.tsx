import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { PinEntryModal } from "../../src/components/modals/PinEntryModal";
import { useAuthStore } from "../../src/store/authStore";
import { deleteCountLine, getCountLines } from "../../src/services/api/api";
import { haptics } from "../../src/services/haptics";
import { flags } from "../../src/constants/flags";
import { PullToRefresh } from "../../src/components/PullToRefresh";
import { BottomSheet } from "../../src/components/ui/BottomSheet";
import { SkeletonList } from "../../src/components/LoadingSkeleton";
import { SwipeableRow } from "../../src/components/SwipeableRow";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ModernCard } from "../../src/components/ui/ModernCard";
import { modernBorderRadius as radius, modernSpacing as spacing, theme } from "../../src/styles/modernDesignSystem";
import { hitSlop, touchTargets } from "@/theme/unified/spacing";
import { colorWithAlpha } from "@/theme/themeTokens";
import { useUiTokens } from "@/hooks/useUiTokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { operationalMotion } from "@/utils/motion";
import { ScreenContainer } from "../../src/components/ui";

const getHistoryFailureReason = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
  }

  return "The request did not finish.";
};

export default function HistoryScreen() {
  const params = useLocalSearchParams();
  const sessionId = params.sessionId as string | undefined;
  const initialApproved =
    flags.enableDeepLinks && (params.approved === "1" || params.approved === "true");
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const uiTokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();

  interface CountLine {
    id: string;
    item_code: string;
    batch_id?: string;
    item_name: string;
    erp_qty: number;
    counted_qty: number;
    variance: number;
    variance_reason?: string;
    remark?: string;
    status: string;
    approval_status?: string;
    counted_at: string;
  }
  const [countLines, setCountLines] = React.useState<CountLine[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loadWarning, setLoadWarning] = React.useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [showApprovedOnly, setShowApprovedOnly] = React.useState<boolean>(!!initialApproved);

  // Pin Entry Modal State
  const [pinModalVisible, setPinModalVisible] = React.useState(false);
  const [selectedLineForDelete, setSelectedLineForDelete] = React.useState<CountLine | null>(null);

  const normalizeStatus = React.useCallback((status?: string | null) => {
    return (status || "").toLowerCase();
  }, []);

  const loadCountLines = React.useCallback(async () => {
    if (!sessionId) {
      setCountLines([]);
      setLoadError(null);
      setLoadWarning(null);
      setLoading(false);
      return;
    }

    try {
      setLoadError(null);
      const data = await getCountLines(sessionId as string);
      const safeData = Array.isArray(data?.items) ? data.items : [];
      setLoadWarning(
        (data as { _degraded?: boolean })?._degraded
          ? "Live history refresh failed. Showing cached count lines from this device. Pull down to refresh or retry when connected."
          : null
      );
      setCountLines(
        showApprovedOnly
          ? safeData.filter((d: any) => {
              const status = normalizeStatus(d.status);
              return status === "approved" || d.approval_status === "APPROVED";
            })
          : safeData
      );
      if (safeData.length && flags.enableHaptics) {
        haptics.success();
      }
    } catch (error) {
      console.error("Load count lines error:", error);
      setLoadError(getHistoryFailureReason(error));
      setLoadWarning(null);
      if (flags.enableHaptics) haptics.error();
    } finally {
      setLoading(false);
    }
  }, [normalizeStatus, sessionId, showApprovedOnly]);

  React.useEffect(() => {
    loadCountLines();
  }, [loadCountLines]);

  // Keep state in sync if URL param changes (e.g., deep link navigation)
  React.useEffect(() => {
    if (!flags.enableDeepLinks) return;
    const approvedParam = params.approved === "1" || params.approved === "true";
    if (approvedParam !== showApprovedOnly) {
      setShowApprovedOnly(approvedParam);
    }
  }, [params.approved, showApprovedOnly]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await loadCountLines();
    } finally {
      setRefreshing(false);
    }
  }, [loadCountLines]);

  // Keyboard shortcuts (web): r = refresh, f = filters
  React.useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") {
        onRefresh();
      }
      if (e.key === "f" || e.key === "F") {
        setFiltersOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRefresh]);

  const handleDeleteRequest = (item: CountLine) => {
    setSelectedLineForDelete(item);
    setPinModalVisible(true);
  };

  const handlePinSuccess = async () => {
    if (!selectedLineForDelete) return;

    try {
      await deleteCountLine(selectedLineForDelete.id);
      if (flags.enableHaptics) haptics.success();
      Alert.alert("Success", "Count line deleted successfully");
      loadCountLines(); // Refresh list
    } catch (error: any) {
      console.error("Delete error:", error);
      Alert.alert(
        "Delete Failed",
        `${error.response?.data?.detail || "The count line could not be deleted."}\n\nThe item remains unchanged. Check connectivity and retry, or ask a supervisor to review it.`
      );
      if (flags.enableHaptics) haptics.error();
    } finally {
      setSelectedLineForDelete(null);
    }
  };

  const renderCountLine = ({ item, index }: { item: CountLine; index: number }) => {
    const varianceColor = item.variance === 0 ? uiTokens.colors.success : uiTokens.colors.error;
    const normalizedStatus = normalizeStatus(item.status);
    const statusColor =
      normalizedStatus === "approved"
        ? uiTokens.colors.success
        : normalizedStatus === "rejected"
          ? uiTokens.colors.error
          : uiTokens.colors.warning;
    const statusTextColor =
      normalizedStatus === "pending" ? uiTokens.colors.textPrimary : theme.colors.text.inverse;

    const CardContent = (
      <ModernCard
        variant="outlined"
        elevation="none"
        padding={0}
        style={[
          styles.countCard,
          { backgroundColor: uiTokens.colors.surface, borderColor: uiTokens.colors.border },
        ]}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.itemName, { color: uiTokens.colors.textPrimary }]}>
            {item.item_name || "Unknown Item"}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusTextColor }]}>
              {(normalizedStatus || "pending").toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.codeRow}>
          <Text style={[styles.itemCode, { color: uiTokens.colors.textSecondary }]}>
            Code: {item.item_code || "N/A"}
          </Text>
          {item.batch_id && (
            <View
              style={[
                styles.batchBadge,
                {
                  backgroundColor: colorWithAlpha(uiTokens.colors.info, 0.1),
                  borderColor: colorWithAlpha(uiTokens.colors.info, 0.24),
                },
              ]}
            >
              <Text style={[styles.batchBadgeText, { color: uiTokens.colors.info }]}>
                Batch: {item.batch_id}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.qtyRow}>
          <View
            style={[
              styles.qtyItem,
              { backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.06) },
            ]}
          >
            <Text style={[styles.qtyLabel, { color: uiTokens.colors.textMuted }]}>ERP</Text>
            <Text style={[styles.qtyValue, { color: uiTokens.colors.textPrimary }]}>
              {item.erp_qty ?? 0}
            </Text>
          </View>
          <View
            style={[
              styles.qtyItem,
              { backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.06) },
            ]}
          >
            <Text style={[styles.qtyLabel, { color: uiTokens.colors.textMuted }]}>Counted</Text>
            <Text style={[styles.qtyValue, { color: uiTokens.colors.textPrimary }]}>
              {item.counted_qty ?? 0}
            </Text>
          </View>
          <View
            style={[
              styles.qtyItem,
              { backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.06) },
            ]}
          >
            <Text style={[styles.qtyLabel, { color: uiTokens.colors.textMuted }]}>Variance</Text>
            <Text style={[styles.qtyValue, { color: varianceColor }]}>{item.variance ?? 0}</Text>
          </View>
        </View>

        {item.variance_reason && (
          <View
            style={[
              styles.reasonBox,
              {
                backgroundColor: colorWithAlpha(uiTokens.colors.warning, 0.08),
                borderColor: colorWithAlpha(uiTokens.colors.warning, 0.22),
              },
            ]}
          >
            <Text style={[styles.reasonLabel, { color: uiTokens.colors.textSecondary }]}>
              Reason:
            </Text>
            <Text style={[styles.reasonText, { color: uiTokens.colors.warning }]}>
              {item.variance_reason}
            </Text>
          </View>
        )}

        {item.remark && (
          <Text style={[styles.remark, { color: uiTokens.colors.textSecondary }]}>
            Remark: {item.remark}
          </Text>
        )}

        <Text style={[styles.timestamp, { color: uiTokens.colors.textMuted }]}>
          {new Date(item.counted_at).toLocaleString()}
        </Text>
      </ModernCard>
    );

    const AnimatedCard = flags.enableAnimations && !prefersReducedMotion ? (
      <Animated.View
        entering={FadeInUp.delay(index * operationalMotion.fast).springify().damping(12)}
      >
        {CardContent}
      </Animated.View>
    ) : (
      CardContent
    );

    if (flags.enableSwipeActions && Platform.OS !== "web") {
      return (
        <SwipeableRow
          rightLabel="Delete"
          onRightAction={() => {
            if (flags.enableHaptics) haptics.selection?.();
            handleDeleteRequest(item);
          }}
        >
          {AnimatedCard}
        </SwipeableRow>
      );
    }

    return AnimatedCard;
  };

  return (
    <ScreenContainer
      backgroundType="solid"
      header={{
        title: "Count History",
        showBackButton: true,
        showUsername: false,
        showLogoutButton: true,
        showSettingsButton: false,
        rightAction: {
          icon: "options-outline",
          label: "Filters",
          onPress: () => setFiltersOpen(true),
        },
      }}
      contentMode="static"
      noPadding
      statusBarStyle="dark"
    >
      {loading && !refreshing ? (
        <View style={styles.skeletonContainer}>
          <SkeletonList itemHeight={120} count={6} />
        </View>
      ) : (
        <PullToRefresh refreshing={refreshing} onRefresh={onRefresh}>
          <FlashList
            data={countLines}
            renderItem={renderCountLine}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              loadWarning ? (
                <View
                  style={[
                    styles.warningContainer,
                    {
                      backgroundColor: colorWithAlpha(uiTokens.colors.warning, 0.08),
                      borderColor: colorWithAlpha(uiTokens.colors.warning, 0.28),
                    },
                  ]}
                  testID="history-load-warning"
                >
                  <Ionicons name="warning-outline" size={20} color={uiTokens.colors.warning} />
                  <Text style={[styles.warningText, { color: uiTokens.colors.textSecondary }]}>
                    {loadWarning}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Retry live history refresh"
                    accessibilityHint="Attempts to refresh count history from the server"
                    hitSlop={hitSlop.small}
                    style={styles.warningRetry}
                    onPress={onRefresh}
                  >
                    <Ionicons name="refresh" size={18} color={uiTokens.colors.warning} />
                  </TouchableOpacity>
                </View>
              ) : null
            }
            ListEmptyComponent={
              loadError ? (
                <View
                  style={[
                    styles.errorContainer,
                    {
                      backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.08),
                      borderColor: colorWithAlpha(uiTokens.colors.error, 0.26),
                    },
                  ]}
                  testID="history-load-error"
                >
                  <Ionicons name="alert-circle-outline" size={44} color={uiTokens.colors.error} />
                  <Text style={[styles.errorTitle, { color: uiTokens.colors.textPrimary }]}>
                    Count history unavailable
                  </Text>
                  <Text style={[styles.errorBody, { color: uiTokens.colors.textSecondary }]}>
                    Could not load this session's count lines. Reason: {loadError} Pull down to
                    refresh or retry now.
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading count history"
                    accessibilityHint="Attempts to load this session's count lines again"
                    hitSlop={hitSlop.small}
                    style={[
                      styles.retryButton,
                      {
                        backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.12),
                        borderColor: colorWithAlpha(uiTokens.colors.error, 0.34),
                      },
                    ]}
                    onPress={onRefresh}
                  >
                    <Ionicons name="refresh" size={18} color={uiTokens.colors.error} />
                    <Text style={[styles.retryButtonText, { color: uiTokens.colors.error }]}>
                      Retry
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="file-tray-outline" size={64} color={uiTokens.colors.textMuted} />
                  <Text style={[styles.emptyText, { color: uiTokens.colors.textSecondary }]}>
                    {loading
                      ? "Loading..."
                      : sessionId
                        ? "No counts yet"
                        : "Open a session from Dashboard history to view its counts"}
                  </Text>
                </View>
              )
            }
          />
        </PullToRefresh>
      )}

      <BottomSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} height={260}>
        <Text style={[styles.filterTitle, { color: uiTokens.colors.textPrimary }]}>Filters</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Approved only filter"
          accessibilityHint="Shows only approved count lines in this history view"
          accessibilityState={{ checked: showApprovedOnly }}
          hitSlop={hitSlop.small}
          style={[
            styles.filterChip,
            {
              backgroundColor: showApprovedOnly
                ? uiTokens.colors.success
                : colorWithAlpha(uiTokens.colors.surfaceElevated, 0.92),
              borderColor: showApprovedOnly ? uiTokens.colors.success : uiTokens.colors.border,
            },
          ]}
          onPress={() => {
            const next = !showApprovedOnly;
            setShowApprovedOnly(next);
            setFiltersOpen(false);
            if (flags.enableDeepLinks) {
              router.replace({
                pathname: "/staff/history",
                params: { sessionId, approved: next ? "1" : undefined },
              });
            }
          }}
        >
          <Ionicons
            name="checkmark-done-outline"
            size={18}
            color={showApprovedOnly ? theme.colors.text.inverse : uiTokens.colors.textMuted}
          />
          <Text
            style={[
              styles.filterChipText,
              {
                color: showApprovedOnly ? theme.colors.text.inverse : uiTokens.colors.textSecondary,
              },
            ]}
          >
            Approved Only
          </Text>
        </TouchableOpacity>
      </BottomSheet>

      <PinEntryModal
        visible={pinModalVisible}
        onClose={() => {
          setPinModalVisible(false);
          setSelectedLineForDelete(null);
        }}
        onSuccess={handlePinSuccess}
        action="delete_count_line"
        staffUsername={user?.username || "unknown"}
        entityId={selectedLineForDelete?.id}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: spacing.lg,
    backgroundColor: "transparent",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colorWithAlpha(theme.colors.text.inverse, 0.05),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colorWithAlpha(theme.colors.text.inverse, 0.08),
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text.primary,
    letterSpacing: -0.3,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  filterTitle: {
    color: theme.colors.text.primary,
    fontWeight: "700",
    fontSize: 16,
    marginBottom: spacing.lg,
    letterSpacing: -0.2,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colorWithAlpha(theme.colors.text.inverse, 0.08),
    backgroundColor: colorWithAlpha(theme.colors.text.inverse, 0.05),
    alignSelf: "flex-start",
  },
  filterChipActive: {
    backgroundColor: theme.colors.success[500],
    borderColor: theme.colors.success[500],
  },
  filterChipText: {
    color: theme.colors.text.secondary,
    fontWeight: "600",
    fontSize: 13,
  },
  filterChipTextActive: {
    color: theme.colors.text.inverse,
  },
  countCard: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text.primary,
    flex: 1,
    letterSpacing: -0.2,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  statusText: {
    color: theme.colors.text.inverse,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemCode: {
    fontSize: 11,
    color: theme.colors.text.secondary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  batchBadge: {
    backgroundColor: colorWithAlpha(theme.colors.info.main, 0.1),
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colorWithAlpha(theme.colors.info.main, 0.2),
  },
  batchBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.primary[400],
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  qtyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  qtyItem: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colorWithAlpha(theme.colors.text.inverse, 0.03),
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  qtyLabel: {
    fontSize: 11,
    color: theme.colors.text.tertiary,
    marginBottom: spacing.xs,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  qtyValue: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text.primary,
    letterSpacing: -0.3,
  },
  reasonBox: {
    backgroundColor: colorWithAlpha(theme.colors.warning.main, 0.08),
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colorWithAlpha(theme.colors.warning.main, 0.2),
  },
  reasonLabel: {
    fontSize: 11,
    color: theme.colors.text.secondary,
    marginBottom: spacing.xs,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  reasonText: {
    fontSize: 13,
    color: unifiedColors.warning[500],
    fontWeight: "700",
  },
  remark: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    fontStyle: "italic",
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  timestamp: {
    fontSize: 11,
    color: theme.colors.text.tertiary,
    textAlign: "right",
    fontWeight: "500",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyText: {
    color: theme.colors.text.secondary,
    fontSize: 15,
    marginTop: spacing.lg,
    fontWeight: "500",
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 48,
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  errorTitle: {
    marginTop: spacing.md,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  errorBody: {
    marginTop: spacing.sm,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  retryButton: {
    minHeight: touchTargets.minimum,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },
  warningRetry: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: touchTargets.minimum,
    minHeight: touchTargets.minimum,
  },
  skeletonContainer: {
    padding: spacing.lg,
  },
});
