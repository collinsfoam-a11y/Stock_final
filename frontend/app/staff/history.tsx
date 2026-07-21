import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { PinEntryModal } from "@/components/modals/PinEntryModal";
import { useAuthStore } from "@/store/authStore";
import { deleteCountLine, getCountLines } from "@/services/api/api";
import { haptics } from "@/services/haptics";
import { flags } from "@/constants/flags";
import { PullToRefresh } from "@/components/PullToRefresh";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SkeletonList } from "@/components/LoadingSkeleton";
import { SwipeableRow } from "@/components/SwipeableRow";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ModernCard } from "@/components/ui/ModernCard";
import { font, radius, gap } from "@/theme/staffUiScale";
// unifiedColors replaced by uiTokens semantic tokens throughout
import { colorWithAlpha } from "@/theme/themeTokens";
import { useUiTokens } from "@/hooks/useUiTokens";
import { ScreenContainer } from "@/components/ui";

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
    // All status badges sit on a solid semantic-color background; use the
    // elevated-surface token for the label so the pending/warning pairing meets
    // contrast (textPrimary on warning failed WCAG AA).
    const statusTextColor = uiTokens.colors.surfaceElevated;

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
          {item.batch_id ? (
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
          ) : null}
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

        {item.variance_reason ? (
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
        ) : null}

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

    const AnimatedCard = flags.enableAnimations ? (
      <Animated.View
        entering={FadeInUp.delay(index * 50)
          .springify()
          .damping(12)}
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
        <View style={{ padding: 16 }}>
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
                    style={styles.warningRetry}
                    onPress={onRefresh}
                    accessibilityRole="button"
                    accessibilityLabel="Retry live history refresh"
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
                    style={[
                      styles.retryButton,
                      {
                        backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.12),
                        borderColor: colorWithAlpha(uiTokens.colors.error, 0.34),
                      },
                    ]}
                    onPress={onRefresh}
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading count history"
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
            color={showApprovedOnly ? uiTokens.colors.surfaceElevated : uiTokens.colors.textMuted}
          />
          <Text
            style={[
              styles.filterChipText,
              {
                color: showApprovedOnly ? uiTokens.colors.surfaceElevated : uiTokens.colors.textSecondary,
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
    paddingHorizontal: gap.xl,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: gap.lg,
    backgroundColor: "transparent",
  },
  list:        { paddingHorizontal: gap.lg, paddingTop: gap.sm },
  // Colors for the filter UI are applied inline from uiTokens at the call sites.
  filterTitle: { fontWeight: font.weight.bold, fontSize: font.size.lg, marginBottom: gap.md, letterSpacing: font.tracking.tight },
  filterChip: {
    flexDirection: "row", alignItems: "center", gap: gap.sm,
    paddingHorizontal: gap.md, paddingVertical: gap.sm,
    borderRadius: radius.lg, borderWidth: 1,
    alignSelf: "flex-start",
  },
  filterChipText:   { fontWeight: font.weight.semibold, fontSize: font.size.base },
  // ── Count line card ───────────────────────────────────────────────────────
  countCard:  { marginBottom: gap.md, paddingVertical: gap.lg, paddingHorizontal: gap.lg, borderRadius: radius.xl },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: gap.sm },
  itemName:   { fontSize: font.size.md, fontWeight: font.weight.bold, flex: 1, letterSpacing: font.tracking.tight },
  statusBadge:{ paddingHorizontal: gap.sm, paddingVertical: 5, borderRadius: radius.sm },
  statusText: { fontSize: font.size.label, fontWeight: font.weight.bold, textTransform: "uppercase", letterSpacing: font.tracking.wide },

  // Code row
  itemCode: { fontSize: font.size.label, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  codeRow:  { flexDirection: "row", alignItems: "center", gap: gap.sm, marginBottom: gap.md },
  batchBadge: {
    paddingHorizontal: gap.sm, paddingVertical: 3,
    borderRadius: radius.xs, borderWidth: 1,
  },
  batchBadgeText: { fontSize: font.size.label, fontWeight: font.weight.bold, textTransform: "uppercase", letterSpacing: font.tracking.normal },

  // Qty grid
  qtyRow:   { flexDirection: "row", justifyContent: "space-between", marginBottom: gap.md, gap: gap.sm },
  qtyItem:  { flex: 1, alignItems: "center", paddingVertical: gap.sm, borderRadius: radius.md },
  qtyLabel: { fontSize: font.size.label, marginBottom: 4, fontWeight: font.weight.semibold, textTransform: "uppercase", letterSpacing: font.tracking.wide },
  qtyValue: { fontSize: font.size.xl, fontWeight: font.weight.bold, letterSpacing: font.tracking.tight },

  // Reason / remark
  reasonBox: {
    borderRadius: radius.md,
    paddingVertical: gap.sm, paddingHorizontal: gap.md,
    marginBottom: gap.sm, borderWidth: 1,
  },
  reasonLabel: { fontSize: font.size.label, marginBottom: 4, fontWeight: font.weight.semibold, textTransform: "uppercase", letterSpacing: font.tracking.wide },
  reasonText:  { fontSize: font.size.sm, fontWeight: font.weight.bold },
  remark:      { fontSize: font.size.sm, fontStyle: "italic", marginBottom: gap.sm, lineHeight: font.leading.snug },
  timestamp:   { fontSize: font.size.label, textAlign: "right", fontWeight: font.weight.medium },

  // Empty / error / warning
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 64 },
  emptyText:      { fontSize: font.size.md, marginTop: gap.lg, fontWeight: font.weight.medium },
  errorContainer: {
    alignItems: "center", justifyContent: "center",
    marginTop: 48, marginHorizontal: gap.lg,
    padding: gap.xl, borderRadius: radius.lg, borderWidth: 1,
  },
  errorTitle:     { marginTop: gap.md, fontSize: font.size.lg, fontWeight: font.weight.bold, textAlign: "center" },
  errorBody:      { marginTop: gap.sm, fontSize: font.size.sm, lineHeight: font.leading.normal, textAlign: "center" },
  retryButton:    {
    minHeight: 44, marginTop: gap.lg, paddingHorizontal: gap.lg,
    borderRadius: radius.md, borderWidth: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: gap.sm,
  },
  retryButtonText: { fontSize: font.size.base, fontWeight: font.weight.bold },
  warningContainer:{
    flexDirection: "row", alignItems: "center", gap: gap.sm,
    marginBottom: gap.md, padding: gap.md, borderRadius: radius.lg, borderWidth: 1,
  },
  warningText:   { flex: 1, fontSize: font.size.caption, lineHeight: font.leading.snug, fontWeight: font.weight.medium },
  warningRetry:  { alignItems: "center", justifyContent: "center", minWidth: 44, minHeight: 44 },
});
