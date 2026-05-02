import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ItemVerificationAPI,
  type VarianceItem,
} from "@/domains/inventory/services/itemVerificationApi";
import {
  ItemFilters,
  type FilterValues,
} from "@/domains/inventory/components/ItemFilters";
import { useSettingsStore } from "@/store/settingsStore";
import { toastService } from "@/services/toastService";
import { saveArrayBufferExport } from "@/utils/fileExport";
import {
  borderRadius,
  colors,
  spacing,
  typography,
} from "@/theme/modernDesign";

type BulkAction = "approve" | "reject";

const CRITICAL_VARIANCE_THRESHOLD = 5;

const getVarianceColor = (variance: number) => {
  if (variance < 0) return colors.error[500];
  if (variance > 0) return colors.warning[600];
  return colors.success[600];
};

const getVarianceLabel = (variance: number) => {
  if (variance < 0) return "Short";
  if (variance > 0) return "Over";
  return "Match";
};

const formatVariance = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${safeValue > 0 ? "+" : ""}${safeValue.toFixed(2)}`;
};

const formatQty = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  return safeValue.toFixed(2);
};

const formatVerificationDate = (value?: string) => {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

const getLocationLabel = (item: VarianceItem) => {
  const parts = [item.warehouse, item.floor, item.rack]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : "Location unavailable";
};

const getCategoryLabel = (item: VarianceItem) => {
  const parts = [item.category, item.subcategory]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : "Uncategorized";
};

export default function VariancesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [variances, setVariances] = useState<VarianceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<FilterValues>({});
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 50,
    skip: 0,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isSelectionMode = selectedIds.size > 0;

  const summary = useMemo(() => {
    const shortages = variances.filter((item) => item.variance < 0).length;
    const overages = variances.filter((item) => item.variance > 0).length;
    const critical = variances.filter(
      (item) => Math.abs(item.variance ?? 0) >= CRITICAL_VARIANCE_THRESHOLD,
    ).length;
    const totalDelta = variances.reduce(
      (sum, item) => sum + (Number.isFinite(item.variance) ? item.variance : 0),
      0,
    );

    return {
      shortages,
      overages,
      critical,
      totalDelta,
    };
  }, [variances]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  }, []);

  const loadVariances = useCallback(
    async ({
      reset = false,
      skipOverride,
    }: { reset?: boolean; skipOverride?: number } = {}) => {
      try {
        if (reset) {
          setLoading(true);
        }

        if (offlineMode) {
          setVariances([]);
          setPagination((prev) => ({
            ...prev,
            total: 0,
            skip: 0,
          }));
          return;
        }

        const skip = reset ? 0 : skipOverride ?? pagination.skip;

        const response = await ItemVerificationAPI.getVariances({
          category: filters.category,
          floor: filters.floor,
          rack: filters.rack,
          warehouse: filters.warehouse,
          limit: pagination.limit,
          skip,
        });

        if (reset) {
          setVariances(response.variances);
        } else {
          setVariances((prev) => [...prev, ...response.variances]);
        }

        setPagination(response.pagination);
      } catch (error: any) {
        Alert.alert("Error", error.message || "Failed to load variances");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters, offlineMode, pagination.limit, pagination.skip],
  );

  useEffect(() => {
    void loadVariances({ reset: true });
  }, [loadVariances]);

  const handleRefresh = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setRefreshing(true);
    void loadVariances({ reset: true });
  };

  const handleLoadMore = () => {
    if (offlineMode || loading) return;

    const nextSkip = pagination.skip + pagination.limit;
    if (nextSkip >= pagination.total) return;

    void loadVariances({ skipOverride: nextSkip });
  };

  const handleBulkAction = async (action: BulkAction) => {
    if (selectedIds.size === 0) return;

    Alert.alert(
      action === "approve" ? "Approve selected variances?" : "Reject selected variances?",
      `${selectedIds.size} selected item(s) will be ${action === "approve" ? "approved" : "rejected"}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action === "approve" ? "Approve" : "Reject",
          style: action === "reject" ? "destructive" : "default",
          onPress: async () => {
            if (offlineMode) {
              Alert.alert(
                "Offline Mode",
                "Bulk variance actions require a live connection.",
              );
              return;
            }

            try {
              setLoading(true);
              const ids = Array.from(selectedIds);
              const result =
                action === "approve"
                  ? await ItemVerificationAPI.bulkApproveVariances(ids)
                  : await ItemVerificationAPI.bulkRejectVariances(ids);

              toastService.showSuccess(
                `${action === "approve" ? "Approved" : "Rejected"} ${result.modified_count} item(s)`,
              );
              setSelectedIds(new Set());
              await loadVariances({ reset: true });
            } catch (error: any) {
              Alert.alert("Error", error.message || "Bulk action failed");
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    try {
      if (offlineMode) {
        Alert.alert(
          "Offline Mode",
          "Variance exports require a live connection.",
        );
        return;
      }

      if (variances.length === 0) {
        Alert.alert("No Data", "There are no variances to export");
        return;
      }

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      const fileData = await ItemVerificationAPI.exportVariancesToERPNext(
        {
          category: filters.category,
          floor: filters.floor,
          rack: filters.rack,
          warehouse: filters.warehouse,
        },
        format,
      );

      const filename = `variances_erpnext_import_${new Date().toISOString().split("T")[0]}.${format}`;

      await saveArrayBufferExport(
        fileData,
        filename,
        format === "csv"
          ? "text/csv"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.message || `Failed to export ${format.toUpperCase()}`,
      );
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === variances.length) {
      setSelectedIds(new Set());
    } else {
      const allIds = variances
        .map((item) => item.count_line_id)
        .filter((value): value is string => Boolean(value));
      setSelectedIds(new Set(allIds));
    }

    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  };

  const renderVarianceItem = ({ item }: { item: VarianceItem }) => {
    const variance = Number.isFinite(item.variance) ? item.variance : 0;
    const accentColor = getVarianceColor(variance);
    const deltaLabel = getVarianceLabel(variance);
    const isCritical = Math.abs(variance) >= CRITICAL_VARIANCE_THRESHOLD;
    const selectableId = item.count_line_id;
    const isSelected = selectableId ? selectedIds.has(selectableId) : false;

    return (
      <TouchableOpacity
        style={[
          styles.itemCard,
          { borderLeftColor: accentColor },
          isSelected && styles.itemCardSelected,
        ]}
        activeOpacity={0.85}
        onLongPress={() => {
          if (!selectableId) return;
          toggleSelection(selectableId);
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        }}
        onPress={() => {
          if (isSelectionMode && selectableId) {
            toggleSelection(selectableId);
            return;
          }

          if (Platform.OS !== "web") {
            Haptics.selectionAsync();
          }

          router.push({
            pathname: "/supervisor/variance-details",
            params: {
              itemCode: item.item_code,
              sessionId: item.session_id || "current",
            },
          });
        }}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemHeaderMain}>
            {isSelectionMode && selectableId ? (
              <View
                style={[
                  styles.selectionCircle,
                  isSelected && styles.selectionCircleActive,
                ]}
              >
                {isSelected ? (
                  <Ionicons name="checkmark" size={14} color={colors.white} />
                ) : null}
              </View>
            ) : null}

            <View style={styles.itemTitleBlock}>
              <Text style={styles.itemName} numberOfLines={2}>
                {item.item_name}
              </Text>
              <Text style={styles.itemCode}>{item.item_code}</Text>
            </View>
          </View>

          <View style={[styles.deltaBadge, { backgroundColor: `${accentColor}14` }]}>
            <Text style={[styles.deltaBadgeText, { color: accentColor }]}>
              {formatVariance(variance)}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View
            style={[
              styles.metaChip,
              isCritical ? styles.metaChipCritical : styles.metaChipStandard,
            ]}
          >
            <Text
              style={[
                styles.metaChipText,
                isCritical
                  ? styles.metaChipTextCritical
                  : styles.metaChipTextStandard,
              ]}
            >
              {isCritical ? "Critical" : "Standard"}
            </Text>
          </View>
          <View style={[styles.metaChip, styles.metaChipNeutral]}>
            <Text style={[styles.metaChipText, styles.metaChipTextNeutral]}>
              {deltaLabel}
            </Text>
          </View>
        </View>

        <Text style={styles.locationText}>{getLocationLabel(item)}</Text>
        <Text style={styles.categoryText}>{getCategoryLabel(item)}</Text>

        <View style={styles.evidenceGrid}>
          <View style={styles.evidenceCell}>
            <Text style={styles.evidenceLabel}>Expected</Text>
            <Text style={styles.evidenceValue}>{formatQty(item.system_qty)}</Text>
          </View>
          <View style={styles.evidenceDivider} />
          <View style={styles.evidenceCell}>
            <Text style={styles.evidenceLabel}>Verified</Text>
            <Text style={styles.evidenceValue}>{formatQty(item.verified_qty)}</Text>
          </View>
          <View style={styles.evidenceDivider} />
          <View style={styles.evidenceCell}>
            <Text style={styles.evidenceLabel}>Delta</Text>
            <Text style={[styles.evidenceValue, { color: accentColor }]}>
              {formatVariance(variance)}
            </Text>
          </View>
        </View>

        <View style={styles.itemFooter}>
          <View style={styles.verificationRow}>
            <Ionicons
              name="person-circle-outline"
              size={16}
              color={colors.gray[400]}
            />
            <Text style={styles.verificationText}>
              {item.verified_by || "Unknown user"} • {formatVerificationDate(item.verified_at)}
            </Text>
          </View>

          <View style={styles.reviewHint}>
            <Text style={styles.reviewHintText}>
              {isSelectionMode ? "Tap to select" : "Tap to review"}
            </Text>
            <Ionicons
              name={isSelectionMode ? "checkbox-outline" : "arrow-forward"}
              size={16}
              color={colors.gray[400]}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const showEmptyState = variances.length === 0 && !loading;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => {
                if (isSelectionMode) {
                  setSelectedIds(new Set());
                  return;
                }
                router.back();
              }}
              accessibilityRole="button"
              accessibilityLabel={isSelectionMode ? "Clear selection" : "Go back"}
            >
              <Ionicons
                name={isSelectionMode ? "close" : "arrow-back"}
                size={22}
                color={colors.gray[800]}
              />
            </TouchableOpacity>

            <View style={styles.headerTextBlock}>
              <Text style={styles.pageTitle}>
                {isSelectionMode ? `${selectedIds.size} Selected` : "Variance Review"}
              </Text>
              <Text style={styles.pageSubtitle}>
                {isSelectionMode
                  ? "Approve or reject the selected discrepancies"
                  : offlineMode
                    ? "Reconnect to review and export discrepancy data"
                    : `${pagination.total} discrepancy record(s) ready for review`}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            {isSelectionMode ? (
              <TouchableOpacity
                style={styles.actionPill}
                onPress={handleSelectAll}
                accessibilityRole="button"
                accessibilityLabel="Toggle select all"
              >
                <Ionicons
                  name={
                    selectedIds.size === variances.length
                      ? "checkmark-done-circle"
                      : "checkbox-outline"
                  }
                  size={18}
                  color={colors.primary[700]}
                />
                <Text style={styles.actionPillText}>All</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.actionPill, variances.length === 0 && styles.actionPillDisabled]}
              onPress={() => void handleExport("csv")}
              disabled={variances.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Export variances as CSV"
            >
              <Text style={styles.actionPillText}>CSV</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionPill, variances.length === 0 && styles.actionPillDisabled]}
              onPress={() => void handleExport("xlsx")}
              disabled={variances.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Export variances as XLSX"
            >
              <Text style={styles.actionPillText}>XLSX</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.summaryEyebrow}>Supervisor Queue</Text>
              <Text style={styles.summaryTitle}>Review discrepancies with evidence first</Text>
            </View>
            <View style={styles.summaryDeltaBadge}>
              <Text style={styles.summaryDeltaText}>{formatVariance(summary.totalDelta)}</Text>
            </View>
          </View>

          <View style={styles.summaryMetrics}>
            <View style={styles.summaryMetric}>
              <Text style={styles.summaryMetricValue}>{summary.critical}</Text>
              <Text style={styles.summaryMetricLabel}>Critical</Text>
            </View>
            <View style={styles.summaryMetric}>
              <Text style={[styles.summaryMetricValue, { color: colors.error[500] }]}>
                {summary.shortages}
              </Text>
              <Text style={styles.summaryMetricLabel}>Shortages</Text>
            </View>
            <View style={styles.summaryMetric}>
              <Text style={[styles.summaryMetricValue, { color: colors.warning[600] }]}>
                {summary.overages}
              </Text>
              <Text style={styles.summaryMetricLabel}>Overages</Text>
            </View>
          </View>
        </View>

        <View style={styles.filterCard}>
          <ItemFilters
            onFilterChange={setFilters}
            showVerifiedFilter={false}
            showSearch={false}
          />
        </View>

        {offlineMode ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Offline mode enabled</Text>
            <Text style={styles.noticeBody}>
              Variance review, bulk actions, and exports need a live connection because discrepancy data is not cached locally.
            </Text>
          </View>
        ) : (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>ERPNext export format</Text>
            <Text style={styles.noticeBody}>
              Blank IDs insert new records. Keep existing IDs when you intend to update ERPNext rows.
            </Text>
          </View>
        )}

        <View style={styles.listWrapper}>
          {loading && variances.length === 0 ? (
            <View style={styles.centeredState}>
              <ActivityIndicator size="large" color={colors.primary[600]} />
              <Text style={styles.centeredTitle}>Loading discrepancies</Text>
              <Text style={styles.centeredSubtitle}>
                Pulling the latest variance records for supervisor review.
              </Text>
            </View>
          ) : showEmptyState ? (
            <View style={styles.centeredState}>
              <Ionicons
                name={
                  offlineMode
                    ? "cloud-offline-outline"
                    : "checkmark-done-circle-outline"
                }
                size={64}
                color={offlineMode ? colors.gray[400] : colors.success[600]}
              />
              <Text style={styles.centeredTitle}>
                {offlineMode ? "Variance list unavailable offline" : "No variances found"}
              </Text>
              <Text style={styles.centeredSubtitle}>
                {offlineMode
                  ? "Reconnect to review discrepancies and run exports."
                  : "All reviewed items currently match the expected quantities."}
              </Text>
            </View>
          ) : (
            <FlashList
              data={variances}
              renderItem={renderVarianceItem}
              // @ts-ignore FlashList runtime supports estimatedItemSize; local typings are stale.
              estimatedItemSize={220}
              keyExtractor={(item, index) =>
                `${item.item_code}-${item.verified_at}-${index}`
              }
              contentContainerStyle={[
                styles.listContent,
                isSelectionMode && { paddingBottom: 120 + insets.bottom },
              ]}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.primary[600]}
                  colors={[colors.primary[600]]}
                />
              }
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                loading && variances.length > 0 ? (
                  <View style={styles.footerLoader}>
                    <ActivityIndicator size="small" color={colors.primary[600]} />
                  </View>
                ) : (
                  <View style={styles.footerSpacer} />
                )
              }
            />
          )}
        </View>

        {isSelectionMode ? (
          <View
            style={[
              styles.bulkBar,
              {
                paddingBottom: Math.max(insets.bottom, spacing.md),
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.bulkButton, styles.bulkRejectButton]}
              onPress={() => void handleBulkAction("reject")}
            >
              <Ionicons name="close-circle" size={18} color={colors.white} />
              <Text style={styles.bulkButtonText}>Reject ({selectedIds.size})</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.bulkButton, styles.bulkApproveButton]}
              onPress={() => void handleBulkAction("approve")}
            >
              <Ionicons name="checkmark-circle" size={18} color={colors.white} />
              <Text style={styles.bulkButtonText}>Approve ({selectedIds.size})</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  headerTextBlock: {
    flex: 1,
  },
  pageTitle: {
    fontSize: typography.fontSize["2xl"],
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
  },
  pageSubtitle: {
    marginTop: 2,
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
    lineHeight: 20,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    paddingLeft: 56,
  },
  actionPill: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  actionPillDisabled: {
    opacity: 0.5,
  },
  actionPillText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[700],
  },
  summaryCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: spacing.lg,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  summaryEyebrow: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[700],
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  summaryTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
    lineHeight: 24,
    maxWidth: "85%",
  },
  summaryDeltaBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray[100],
  },
  summaryDeltaText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[800],
  },
  summaryMetrics: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  summaryMetric: {
    flex: 1,
    minHeight: 86,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray[50],
    justifyContent: "space-between",
  },
  summaryMetricValue: {
    fontSize: typography.fontSize["2xl"],
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[700],
  },
  summaryMetricLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  filterCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  noticeCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  noticeTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[800],
    marginBottom: spacing.xs,
  },
  noticeBody: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[600],
    lineHeight: 20,
  },
  listWrapper: {
    flex: 1,
    marginTop: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  itemCard: {
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderLeftWidth: 4,
  },
  itemCardSelected: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[50],
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  itemHeaderMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  selectionCircle: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.gray[300],
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    backgroundColor: colors.white,
  },
  selectionCircleActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  itemTitleBlock: {
    flex: 1,
  },
  itemName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
    lineHeight: 24,
  },
  itemCode: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[700],
  },
  deltaBadge: {
    minWidth: 82,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  deltaBadgeText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  metaChip: {
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  metaChipCritical: {
    backgroundColor: colors.error[50],
  },
  metaChipStandard: {
    backgroundColor: colors.warning[50],
  },
  metaChipNeutral: {
    backgroundColor: colors.gray[100],
  },
  metaChipText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  metaChipTextCritical: {
    color: colors.error[600],
  },
  metaChipTextStandard: {
    color: colors.warning[600],
  },
  metaChipTextNeutral: {
    color: colors.gray[600],
  },
  locationText: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.sm,
    color: colors.gray[700],
  },
  categoryText: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
  },
  evidenceGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray[50],
    gap: spacing.sm,
  },
  evidenceCell: {
    flex: 1,
  },
  evidenceDivider: {
    width: 1,
    backgroundColor: colors.gray[200],
  },
  evidenceLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: spacing.xs,
  },
  evidenceValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
    fontVariant: ["tabular-nums"],
  },
  itemFooter: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  verificationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  verificationText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
  },
  reviewHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reviewHintText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[600],
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing["3xl"],
  },
  centeredTitle: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
    textAlign: "center",
  },
  centeredSubtitle: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
    lineHeight: 20,
    textAlign: "center",
  },
  footerLoader: {
    paddingVertical: spacing.lg,
  },
  footerSpacer: {
    height: spacing.xl,
  },
  bulkBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
  },
  bulkButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  bulkRejectButton: {
    backgroundColor: colors.error[500],
  },
  bulkApproveButton: {
    backgroundColor: colors.success[600],
  },
  bulkButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
});
