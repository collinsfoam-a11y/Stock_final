/**
 * Variance List Screen
 * Displays all items with variances (verified qty != system qty)
 * Refactored to use Aurora Design System
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import {
  ItemVerificationAPI,
  VarianceItem,
} from "../../src/domains/inventory/services/itemVerificationApi";
import { ItemFilters, FilterValues } from "../../src/domains/inventory/components/ItemFilters";
import { ScreenContainer, ModernCard, AnimatedPressable } from "../../src/components/ui";
import { useSettingsStore } from "../../src/store/settingsStore";
import { theme } from "../../src/styles/modernDesignSystem";
import { toastService } from "../../src/services/toastService";
import { saveArrayBufferExport } from "../../src/utils/fileExport";
import { safeBackNavigation } from "@/utils/navigation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { colorWithAlpha } from "@/theme/themeTokens";
import { operationalMotion } from "@/utils/motion";

export default function VariancesScreen() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
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

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isSelectionMode = selectedIds.size > 0;
  const headerEntry = prefersReducedMotion ? undefined : FadeInDown.delay(100).springify();
  const filtersEntry = prefersReducedMotion ? undefined : FadeInDown.delay(200).springify();
  const bulkEntry = prefersReducedMotion ? undefined : FadeInDown.duration(operationalMotion.slow);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
    if (Platform.OS !== "web") Haptics.selectionAsync();
  };

  const handleSelectAll = () => {
    if (selectedIds.size === variances.length) {
      setSelectedIds(new Set());
    } else {
      const allIds = variances.map((v) => v.count_line_id).filter((id): id is string => !!id);
      setSelectedIds(new Set(allIds));
    }
    if (Platform.OS !== "web") Haptics.selectionAsync();
  };

  const handleBulkAction = async (action: "approve" | "reject") => {
    if (selectedIds.size === 0) return;

    Alert.alert(
      `Confirm ${action === "approve" ? "Approval" : "Rejection"}`,
      `Are you sure you want to ${action} ${selectedIds.size} items?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: action === "reject" ? "destructive" : "default",
          onPress: async () => {
            if (offlineMode) {
              Alert.alert("Offline Mode", "Bulk variance actions require a live connection.");
              return;
            }
            try {
              setLoading(true);
              const ids = Array.from(selectedIds);
              let result;

              if (action === "approve") {
                result = await ItemVerificationAPI.bulkApproveVariances(ids);
              } else {
                result = await ItemVerificationAPI.bulkRejectVariances(ids);
              }

              toastService.showSuccess(`Successfully ${action}d ${result.modified_count} items`);
              setSelectedIds(new Set());
              loadVariances(true);
            } catch (error: any) {
              Alert.alert("Error", error.message || "Bulk action failed");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const loadVariances = React.useCallback(
    async (reset = false) => {
      try {
        if (reset) {
          setLoading(true);
          setPagination((prev) => ({ ...prev, skip: 0 }));
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

        const skip = reset ? 0 : pagination.skip;
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
    [filters, offlineMode, pagination.limit, pagination.skip]
  );

  useEffect(() => {
    loadVariances(true);
  }, [loadVariances]);

  const handleRefresh = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    loadVariances(true);
  };

  const handleLoadMore = () => {
    if (offlineMode) {
      return;
    }

    if (!loading && pagination.skip + pagination.limit < pagination.total) {
      setPagination((prev) => ({
        ...prev,
        skip: prev.skip + prev.limit,
      }));
      loadVariances(false);
    }
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    try {
      if (offlineMode) {
        Alert.alert("Offline Mode", "Variance exports require a live connection.");
        return;
      }

      if (variances.length === 0) {
        Alert.alert("No Data", "There are no variances to export");
        return;
      }

      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const fileData = await ItemVerificationAPI.exportVariancesToERPNext(
        {
          category: filters.category,
          floor: filters.floor,
          rack: filters.rack,
          warehouse: filters.warehouse,
        },
        format
      );
      const filename = `variances_erpnext_import_${new Date().toISOString().split("T")[0]}.${format}`;

      await saveArrayBufferExport(
        fileData,
        filename,
        format === "csv"
          ? "text/csv"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    } catch (error: any) {
      Alert.alert("Error", error.message || `Failed to export ${format.toUpperCase()}`);
    }
  };

  const renderVarianceItem = ({ item }: { item: VarianceItem }) => {
    // Determine status color based on variance
    const isPositive = item.variance > 0;
    const statusColor = isPositive ? theme.colors.success[500] : theme.colors.error[500];

    const varianceSign = isPositive ? "+" : "";

    const isSelected = item.count_line_id ? selectedIds.has(item.count_line_id) : false;

    return (
      <AnimatedPressable
        onLongPress={() => {
          if (item.count_line_id) {
            toggleSelection(item.count_line_id);
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        }}
        onPress={() => {
          if (isSelectionMode && item.count_line_id) {
            toggleSelection(item.count_line_id);
          } else {
            if (Platform.OS !== "web") Haptics.selectionAsync();
            router.push({
              pathname: "/supervisor/variance-details",
              params: {
                itemCode: item.item_code,
                sessionId: item.session_id || "current",
              },
            });
          }
        }}
        style={{ marginBottom: theme.spacing.md }}
        accessibilityLabel={`${isSelected ? "Selected" : "Unselected"} variance for ${item.item_name || item.item_code}, system quantity ${(item.system_qty ?? 0).toFixed(2)}, verified quantity ${(item.verified_qty ?? 0).toFixed(2)}`}
        accessibilityHint={
          isSelectionMode
            ? "Toggles this variance selection"
            : "Opens variance details. Long press to select this item."
        }
        accessibilityState={{ selected: isSelected }}
      >
        <ModernCard
          variant="outlined"
          elevation="none"
          padding={theme.spacing.md}
          style={{
            borderColor: isSelected ? theme.colors.primary[500] : `${statusColor}40`,
            borderWidth: isSelected ? 2 : 1,
            backgroundColor: isSelected
              ? colorWithAlpha(theme.colors.primary[500], 0.1)
              : undefined,
          }}
        >
          <View style={styles.varianceHeader}>
            <View style={styles.varianceTitleRow}>
              {/* Selection Circle */}
              {isSelectionMode && (
                <View
                  style={{
                    marginRight: theme.spacing.md,
                    width: 24,
                    height: 24,
                    borderRadius: theme.borderRadius.full,
                    borderWidth: 2,
                    borderColor: isSelected
                      ? theme.colors.primary[500]
                      : theme.colors.text.tertiary,
                    backgroundColor: isSelected ? theme.colors.primary[500] : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isSelected && <Ionicons name="checkmark" size={16} color="white" />}
                </View>
              )}
              <View style={styles.varianceHeaderLeft}>
                <Text style={styles.itemName}>{item.item_name}</Text>
                <Text style={styles.itemCode}>{item.item_code}</Text>
              </View>
            </View>
            <View
              style={[styles.varianceBadge, { backgroundColor: colorWithAlpha(statusColor, 0.12) }]}
            >
              <Text style={[styles.varianceBadgeText, { color: statusColor }]}>
                {varianceSign}
                {(item.variance ?? 0).toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={styles.varianceDetails}>
            <View style={styles.qtyRow}>
              <View style={styles.qtyItem}>
                <Text style={styles.qtyLabel}>System Qty</Text>
                <Text style={styles.qtyValue}>{(item.system_qty ?? 0).toFixed(2)}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.qtyItem}>
                <Text style={styles.qtyLabel}>Verified Qty</Text>
                <Text style={[styles.qtyValue, { color: theme.colors.text.primary }]}>
                  {(item.verified_qty ?? 0).toFixed(2)}
                </Text>
              </View>
            </View>

            {(item.floor || item.rack) && (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color={theme.colors.text.tertiary} />
                <Text style={styles.locationText}>
                  {[item.floor, item.rack].filter(Boolean).join(" / ")}
                </Text>
              </View>
            )}

            {item.category && (
              <Text style={styles.categoryText}>
                {item.category}
                {item.subcategory && ` • ${item.subcategory}`}
              </Text>
            )}

            <View style={styles.verificationInfo}>
              <Ionicons name="person-outline" size={12} color={theme.colors.text.tertiary} />
              <Text style={styles.verificationInfoText}>
                Verified by {item.verified_by}
                {item.verified_at && ` • ${new Date(item.verified_at).toLocaleDateString()}`}
              </Text>
            </View>
          </View>
        </ModernCard>
      </AnimatedPressable>
    );
  };

  return (
    <ScreenContainer>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Header */}
        <Animated.View entering={headerEntry} style={styles.header}>
          <View style={styles.headerLeft}>
            {isSelectionMode ? (
              <AnimatedPressable
                onPress={() => setSelectedIds(new Set())}
                style={styles.backButton}
                accessibilityLabel="Clear variance selection"
                accessibilityHint="Exits bulk selection mode"
              >
                <Ionicons name="close" size={24} color={theme.colors.text.primary} />
              </AnimatedPressable>
            ) : (
              <AnimatedPressable
                onPress={() => safeBackNavigation(router, { userRole: "supervisor" })}
                style={styles.backButton}
                accessibilityLabel="Back to supervisor"
                accessibilityHint="Returns to the supervisor area"
              >
                <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
              </AnimatedPressable>
            )}
            <View>
              <Text style={styles.pageTitle}>
                {isSelectionMode ? `${selectedIds.size} Selected` : "Variances"}
              </Text>
              <Text style={styles.pageSubtitle}>
                {isSelectionMode
                  ? "Select items to approve/reject"
                  : `${pagination.total} discrepancies found`}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            {isSelectionMode && (
              <AnimatedPressable
                style={styles.exportButton}
                onPress={handleSelectAll}
                accessibilityLabel={
                  selectedIds.size === variances.length
                    ? "Clear all selected variances"
                    : "Select all variances"
                }
                accessibilityHint="Toggles all variance selections"
              >
                <ModernCard variant="outlined" elevation="none" padding={theme.spacing.sm}>
                  <Ionicons
                    name={
                      selectedIds.size === variances.length
                        ? "checkmark-done-circle"
                        : "checkmark-circle-outline"
                    }
                    size={20}
                    color={theme.colors.text.primary}
                  />
                </ModernCard>
              </AnimatedPressable>
            )}

            <View style={styles.exportActions}>
              <AnimatedPressable
                style={[styles.exportFormatButton, variances.length === 0 && { opacity: 0.5 }]}
                onPress={() => void handleExport("csv")}
                disabled={variances.length === 0}
                accessibilityLabel="Export variances as CSV"
                accessibilityHint="Downloads variance data in CSV format"
              >
                <ModernCard variant="outlined" elevation="none" padding={theme.spacing.sm}>
                  <Text style={styles.exportFormatLabel}>CSV</Text>
                </ModernCard>
              </AnimatedPressable>
              <AnimatedPressable
                style={[styles.exportFormatButton, variances.length === 0 && { opacity: 0.5 }]}
                onPress={() => void handleExport("xlsx")}
                disabled={variances.length === 0}
                accessibilityLabel="Export variances as XLSX"
                accessibilityHint="Downloads variance data in spreadsheet format"
              >
                <ModernCard variant="outlined" elevation="none" padding={theme.spacing.sm}>
                  <Text style={styles.exportFormatLabel}>XLSX</Text>
                </ModernCard>
              </AnimatedPressable>
            </View>
          </View>
        </Animated.View>

        {/* Filters */}
        <Animated.View entering={filtersEntry}>
          <ModernCard
            variant="outlined"
            elevation="none"
            padding={theme.spacing.sm}
            style={{ marginBottom: theme.spacing.md }}
          >
            <ItemFilters
              onFilterChange={setFilters}
              showVerifiedFilter={false} // Verified filter irrelevant here as all are filtered by variance
              showSearch={false}
            />
          </ModernCard>
        </Animated.View>

        {offlineMode && (
          <ModernCard
            variant="outlined"
            elevation="none"
            padding={theme.spacing.sm}
            style={{ marginBottom: theme.spacing.md }}
          >
            <Text style={styles.offlineNoticeTitle}>Offline mode enabled</Text>
            <Text style={styles.offlineNoticeBody}>
              Variance review, bulk approve/reject, and exports require a live connection because
              discrepancy data is not cached locally.
            </Text>
          </ModernCard>
        )}

        {!offlineMode && (
          <ModernCard
            variant="outlined"
            elevation="none"
            padding={theme.spacing.sm}
            style={{ marginBottom: theme.spacing.md }}
          >
            <Text style={styles.exportHintTitle}>ERPNext import format</Text>
            <Text style={styles.exportHintBody}>
              Blank ID inserts new rows. Keep ID to update existing ERPNext records.
            </Text>
          </ModernCard>
        )}

        {variances.length === 0 && !loading ? (
          <View style={styles.centered}>
            <Ionicons
              name={offlineMode ? "cloud-offline-outline" : "checkmark-done-circle-outline"}
              size={64}
              color={offlineMode ? theme.colors.text.tertiary : theme.colors.success.main}
            />
            <Text style={styles.emptyText}>
              {offlineMode ? "Variance list unavailable offline" : "No variances found"}
            </Text>
            <Text style={styles.emptySubtext}>
              {offlineMode
                ? "Reconnect to review discrepancies and approve or reject them."
                : "All items match system quantities"}
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlashList
              data={variances}
              renderItem={renderVarianceItem}
              // @ts-ignore
              estimatedItemSize={180}
              keyExtractor={(item, index) => `${item.item_code}-${item.verified_at}-${index}`}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={theme.colors.primary[500]}
                  colors={[theme.colors.primary[500]]}
                />
              }
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                loading && variances.length > 0 ? (
                  <View style={styles.footerLoader}>
                    <ActivityIndicator size="small" color={theme.colors.primary[500]} />
                  </View>
                ) : (
                  <View style={styles.footerSpacer} />
                )
              }
            />
          </View>
        )}
      </View>

      {/* Bulk Action Bar */}
      {isSelectionMode && (
        <Animated.View entering={bulkEntry} style={styles.bulkActionBar}>
          <ModernCard
            variant="outlined"
            elevation="none"
            padding={theme.spacing.md}
            style={styles.bulkActionCard}
          >
            <AnimatedPressable
              style={[styles.bulkButton, { backgroundColor: theme.colors.error[500] }]}
              onPress={() => handleBulkAction("reject")}
              accessibilityLabel={`Reject ${selectedIds.size} selected variances`}
              accessibilityHint="Rejects the selected variance records after confirmation"
            >
              <Ionicons name="close-circle" size={20} color="white" />
              <Text style={styles.bulkButtonText}>Reject ({selectedIds.size})</Text>
            </AnimatedPressable>

            <AnimatedPressable
              style={[styles.bulkButton, { backgroundColor: theme.colors.success[500] }]}
              onPress={() => handleBulkAction("approve")}
              accessibilityLabel={`Approve ${selectedIds.size} selected variances`}
              accessibilityHint="Approves the selected variance records after confirmation"
            >
              <Ionicons name="checkmark-circle" size={20} color="white" />
              <Text style={styles.bulkButtonText}>Approve ({selectedIds.size})</Text>
            </AnimatedPressable>
          </ModernCard>
        </Animated.View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: theme.spacing.md,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 100,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  headerActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  backButton: {
    padding: theme.spacing.xs,
    backgroundColor: colorWithAlpha(theme.colors.text.primary, 0.05),
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: colorWithAlpha(theme.colors.text.primary, 0.1),
  },
  pageTitle: {
    fontSize: 32,
    color: theme.colors.text.primary,
    fontWeight: "700",
  },
  pageSubtitle: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  exportButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  exportActions: {
    flexDirection: "row",
    gap: theme.spacing.xs,
  },
  exportFormatButton: {
    minWidth: 52,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  exportFormatLabel: {
    color: theme.colors.text.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  listContent: {
    paddingBottom: theme.spacing.xl,
  },
  varianceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: theme.spacing.md,
  },
  varianceHeaderLeft: {
    flex: 1,
  },
  varianceTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.xs,
  },
  itemCode: {
    fontSize: 14,
    color: theme.colors.text.tertiary,
  },
  varianceBadge: {
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    minWidth: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  varianceBadgeText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  varianceDetails: {
    //
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    backgroundColor: colorWithAlpha(theme.colors.text.primary, 0.03),
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
  },
  qtyItem: {
    flex: 1,
  },
  divider: {
    width: 1,
    height: "80%",
    backgroundColor: colorWithAlpha(theme.colors.text.primary, 0.1),
  },
  qtyLabel: {
    fontSize: 12,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  qtyValue: {
    fontSize: 20,
    fontWeight: "600",
    color: theme.colors.text.secondary, // Subtle for System, Primary/Highlight for Verified
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  locationText: {
    fontSize: 12,
    color: theme.colors.text.secondary,
  },
  categoryText: {
    fontSize: 12,
    color: theme.colors.text.tertiary,
    fontStyle: "italic",
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  verificationInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colorWithAlpha(theme.colors.text.primary, 0.05),
  },
  verificationInfoText: {
    fontSize: 12,
    color: theme.colors.text.tertiary,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: 16,
    color: theme.colors.text.secondary,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "500",
    color: theme.colors.text.secondary,
    marginTop: theme.spacing.md,
  },
  emptySubtext: {
    fontSize: 16,
    color: theme.colors.text.tertiary,
    marginTop: theme.spacing.xs,
  },
  bulkActionBar: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  bulkActionCard: {
    flexDirection: "row",
    gap: theme.spacing.md,
    width: "100%",
  },
  bulkButton: {
    flex: 1,
    height: 50,
    borderRadius: theme.borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    elevation: 8,
  },
  bulkButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  offlineNoticeTitle: {
    color: theme.colors.text.primary,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: theme.spacing.xs,
  },
  offlineNoticeBody: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  exportHintTitle: {
    color: theme.colors.text.primary,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: theme.spacing.xs,
  },
  exportHintBody: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  footerLoader: {
    paddingVertical: theme.spacing.xl,
  },
  footerSpacer: {
    height: theme.spacing.xl,
  },
});
