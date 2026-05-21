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
  useWindowDimensions,
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
import {
  AnimatedPressable,
  ModernCard,
  OPERATIONAL_LIST_ROW_ESTIMATED_HEIGHT,
  OperationalCommandBar,
  OperationalListSection,
  OperationalListRow,
  OperationalSplitView,
  OperationalStatusStrip,
  ScreenContainer,
} from "../../src/components/ui";
import type {
  OperationalCommandAction,
  OperationalListRowSeverity,
  OperationalListRowTone,
} from "../../src/components/ui";
import { useSettingsStore } from "../../src/store/settingsStore";
import { theme } from "../../src/styles/modernDesignSystem";
import { toastService } from "../../src/services/toastService";
import { saveArrayBufferExport } from "../../src/utils/fileExport";
import { safeBackNavigation } from "@/utils/navigation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useOperationalQueueNavigation } from "@/hooks/useOperationalQueueNavigation";
import { BREAKPOINTS } from "@/hooks/useResponsive";
import { useUiTokens } from "../../src/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { operationalMotion } from "@/utils/motion";

const getVarianceTone = (variance: number): OperationalListRowTone => {
  if (variance < 0) return "error";
  if (variance > 0) return "variance";
  return "success";
};

const getVarianceSeverity = (variance: number): OperationalListRowSeverity => {
  const magnitude = Math.abs(variance);
  if (magnitude >= 10) return "critical";
  if (magnitude > 0) return "high";
  return "none";
};

export default function VariancesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const uiTokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [variances, setVariances] = useState<VarianceItem[]>([]);
  const [selectedVariance, setSelectedVariance] = useState<VarianceItem | null>(null);
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
  const filtersEntry = prefersReducedMotion ? undefined : FadeInDown.delay(200).springify();
  const bulkEntry = prefersReducedMotion ? undefined : FadeInDown.duration(operationalMotion.slow);

  const toggleSelection = React.useCallback((id: string) => {
    setSelectedIds((current) => {
      const newSet = new Set(current);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
    if (Platform.OS !== "web") Haptics.selectionAsync();
  }, []);

  const handleSelectAll = () => {
    if (selectedIds.size === variances.length) {
      setSelectedIds(new Set());
    } else {
      const allIds = variances.map((v) => v.count_line_id).filter((id): id is string => !!id);
      setSelectedIds(new Set(allIds));
    }
    if (Platform.OS !== "web") Haptics.selectionAsync();
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

  const handleBulkAction = React.useCallback(
    async (action: "approve" | "reject") => {
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
    },
    [loadVariances, offlineMode, selectedIds]
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

  const renderVarianceItem = React.useCallback(
    ({ item }: { item: VarianceItem }) => {
      const isPositive = item.variance > 0;
      const varianceSign = isPositive ? "+" : "";
      const varianceValue = Number(item.variance ?? 0);
      const varianceLabel = `${varianceSign}${varianceValue.toFixed(2)}`;
      const isSelected = item.count_line_id ? selectedIds.has(item.count_line_id) : false;
      const title = item.item_name || item.item_code || "Unknown item";
      const metadata = [
        item.floor || item.rack
          ? `Location ${[item.floor, item.rack].filter(Boolean).join(" / ")}`
          : null,
        item.category
          ? `Category ${item.category}${item.subcategory ? ` / ${item.subcategory}` : ""}`
          : null,
      ].filter(Boolean) as string[];

      return (
        <OperationalListRow
          title={title}
          subtitle={item.item_code}
          metadata={metadata}
          metrics={[
            {
              label: "System",
              value: (item.system_qty ?? 0).toFixed(2),
              tone: "neutral",
              icon: "server-outline",
            },
            {
              label: "Verified",
              value: (item.verified_qty ?? 0).toFixed(2),
              tone: "info",
              icon: "checkmark-done-outline",
            },
            {
              label: "Var",
              value: varianceLabel,
              tone: getVarianceTone(varianceValue),
              icon: isPositive ? "trending-up-outline" : "trending-down-outline",
            },
          ]}
          status={`VAR ${varianceLabel}`}
          statusTone={getVarianceTone(varianceValue)}
          severity={getVarianceSeverity(varianceValue)}
          leftIcon={isSelected ? "checkmark-circle" : "analytics-outline"}
          badges={
            [
              item.verified_by
                ? {
                    label: `Verified by ${item.verified_by}`,
                    tone: "info",
                    icon: "person-outline",
                  }
                : undefined,
            ].filter(Boolean) as NonNullable<
              React.ComponentProps<typeof OperationalListRow>["badges"]
            >
          }
          timestamps={
            item.verified_at
              ? {
                  label: "Verified",
                  value: new Date(item.verified_at).toLocaleDateString(),
                  icon: "calendar-outline",
                }
              : undefined
          }
          selectable={Boolean(item.count_line_id)}
          selected={isSelected}
          onLongPress={() => {
            if (item.count_line_id) {
              toggleSelection(item.count_line_id);
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
          }}
          onPress={() => {
            setSelectedVariance(item);
            if (isSelectionMode && item.count_line_id) {
              toggleSelection(item.count_line_id);
            } else if (width < BREAKPOINTS.tablet) {
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
          onKeyboardOpen={() =>
            router.push({
              pathname: "/supervisor/variance-details",
              params: {
                itemCode: item.item_code,
                sessionId: item.session_id || "current",
              },
            })
          }
          accessibility={{
            label: `${isSelected ? "Selected" : "Unselected"} variance for ${title}. System quantity ${(item.system_qty ?? 0).toFixed(2)}. Verified quantity ${(item.verified_qty ?? 0).toFixed(2)}.`,
            hint: isSelectionMode
              ? "Toggles this variance selection"
              : "Opens variance details. Long press to select this item.",
          }}
          style={styles.rowSpacing}
        />
      );
    },
    [isSelectionMode, router, selectedIds, toggleSelection, width]
  );

  const getVarianceId = React.useCallback(
    (item: VarianceItem) =>
      item.count_line_id || `${item.item_code}-${item.session_id || "current"}-${item.verified_at || ""}`,
    []
  );

  const openVarianceDetail = React.useCallback(
    (item: VarianceItem) => {
      router.push({
        pathname: "/supervisor/variance-details",
        params: {
          itemCode: item.item_code,
          sessionId: item.session_id || "current",
        },
      });
    },
    [router]
  );

  useOperationalQueueNavigation({
    items: variances,
    selectedItem: selectedVariance,
    getItemId: getVarianceId,
    onSelect: setSelectedVariance,
    onOpen: openVarianceDetail,
    onEscape: () => setSelectedVariance(null),
    enabled: !loading,
  });

  const criticalVarianceCount = React.useMemo(
    () => variances.filter((item) => Math.abs(Number(item.variance || 0)) >= 10).length,
    [variances]
  );

  const selectedVarianceActions = React.useMemo<OperationalCommandAction[]>(() => {
    if (!selectedVariance) return [];
    const selectedId = selectedVariance.count_line_id;
    const isSelected = selectedId ? selectedIds.has(selectedId) : false;

    const baseActions: OperationalCommandAction[] = [
      {
        id: "open-detail",
        label: "Open Detail",
        icon: "open-outline",
        tone: "primary",
        onPress: () => openVarianceDetail(selectedVariance),
        accessibilityLabel: `Open variance detail for ${selectedVariance.item_code}`,
        accessibilityHint: "Opens the full variance verification workflow",
      },
      {
        id: "toggle-selection",
        label: isSelected ? "Clear Selection" : "Select",
        icon: isSelected ? "remove-circle-outline" : "checkmark-circle-outline",
        tone: isSelected ? "neutral" : "secondary",
        shortcut: "Space",
        disabled: !selectedId,
        onPress: selectedId ? () => toggleSelection(selectedId) : undefined,
        accessibilityLabel: `${isSelected ? "Clear" : "Select"} variance ${selectedVariance.item_code}`,
        accessibilityHint: "Adds or removes this variance from the bulk verification command set",
      },
    ];

    if (isSelectionMode) {
      return baseActions;
    }

    return [
      ...baseActions,
      {
        id: "approve-selected",
        label: "Approve",
        icon: "checkmark-done-outline",
        tone: "success",
        shortcut: "Mod+V",
        disabled: selectedIds.size === 0 || offlineMode,
        onPress: () => void handleBulkAction("approve"),
        accessibilityLabel: `Approve ${selectedIds.size} selected variances`,
        accessibilityHint: "Approves selected variances after confirmation",
      },
      {
        id: "reject-selected",
        label: "Reject",
        icon: "close-circle-outline",
        tone: "danger",
        shortcut: "Mod+Shift+R",
        disabled: selectedIds.size === 0 || offlineMode,
        onPress: () => void handleBulkAction("reject"),
        accessibilityLabel: `Reject ${selectedIds.size} selected variances`,
        accessibilityHint: "Rejects selected variances after confirmation",
      },
    ];
  }, [handleBulkAction, isSelectionMode, offlineMode, openVarianceDetail, selectedIds, selectedVariance, toggleSelection]);

  const varianceDetailPanel = React.useMemo(() => {
    if (!selectedVariance) {
      return (
        <View style={styles.detailEmpty}>
          <Ionicons name="analytics-outline" size={48} color={theme.colors.text.tertiary} />
          <Text style={styles.detailEmptyTitle}>Select a variance</Text>
          <Text style={styles.detailEmptyBody}>
            Pick a variance row to keep queue context while reviewing discrepancy detail.
          </Text>
        </View>
      );
    }

    const variance = Number(selectedVariance.variance || 0);
    const varianceLabel = `${variance > 0 ? "+" : ""}${variance.toFixed(2)}`;

    return (
      <View style={styles.detailPanel}>
        <View>
          <Text style={styles.detailEyebrow}>Variance detail</Text>
          <Text style={styles.detailTitle} numberOfLines={2}>
            {selectedVariance.item_name || selectedVariance.item_code}
          </Text>
          <Text style={styles.detailSubtitle} numberOfLines={1}>
            {selectedVariance.item_code}
          </Text>
        </View>

        <View style={styles.detailMetricGrid}>
          <View style={styles.detailMetric}>
            <Text style={styles.detailMetricLabel}>System</Text>
            <Text style={styles.detailMetricValue}>
              {(selectedVariance.system_qty ?? 0).toFixed(2)}
            </Text>
          </View>
          <View style={styles.detailMetric}>
            <Text style={styles.detailMetricLabel}>Verified</Text>
            <Text style={styles.detailMetricValue}>
              {(selectedVariance.verified_qty ?? 0).toFixed(2)}
            </Text>
          </View>
          <View style={styles.detailMetric}>
            <Text style={styles.detailMetricLabel}>Variance</Text>
            <Text
              style={[
                styles.detailMetricValue,
                {
                  color: variance < 0 ? theme.colors.error[500] : theme.colors.warning[500],
                },
              ]}
            >
              {varianceLabel}
            </Text>
          </View>
        </View>

        <View style={styles.detailMetaBlock}>
          <Text style={styles.detailMetaText}>
            Location: {[selectedVariance.floor, selectedVariance.rack].filter(Boolean).join(" / ") || "N/A"}
          </Text>
          <Text style={styles.detailMetaText}>
            Verified by: {selectedVariance.verified_by || "N/A"}
          </Text>
          <Text style={styles.detailMetaText}>
            Session: {selectedVariance.session_id || "current"}
          </Text>
        </View>

        <OperationalCommandBar
          compact
          align="stretch"
          title="Variance commands"
          subtitle="Enter opens detail, Space selects, Cmd/Ctrl+V approves selected, Cmd/Ctrl+Shift+R rejects selected."
          actions={selectedVarianceActions}
          style={styles.detailCommandBar}
        />
      </View>
    );
  }, [selectedVariance, selectedVarianceActions]);

  const bulkCommandActions = React.useMemo<OperationalCommandAction[]>(
    () => [
      {
        id: "reject-selected",
        label: `Reject (${selectedIds.size})`,
        icon: "close-circle-outline",
        tone: "danger",
        shortcut: "Mod+Shift+R",
        disabled: selectedIds.size === 0 || offlineMode,
        onPress: () => void handleBulkAction("reject"),
        accessibilityLabel: `Reject ${selectedIds.size} selected variances`,
        accessibilityHint: "Rejects the selected variance records after confirmation",
      },
      {
        id: "approve-selected",
        label: `Approve (${selectedIds.size})`,
        icon: "checkmark-circle-outline",
        tone: "success",
        shortcut: "Mod+V",
        disabled: selectedIds.size === 0 || offlineMode,
        onPress: () => void handleBulkAction("approve"),
        accessibilityLabel: `Approve ${selectedIds.size} selected variances`,
        accessibilityHint: "Approves the selected variance records after confirmation",
      },
    ],
    [handleBulkAction, offlineMode, selectedIds.size]
  );

  return (
    <ScreenContainer
      header={{
        showBackButton: true,
        onBackPress: () => {
          if (isSelectionMode) {
            setSelectedIds(new Set());
          } else {
            safeBackNavigation(router, { userRole: "supervisor" });
          }
        },
        title: isSelectionMode ? `${selectedIds.size} Selected` : "Variances",
        subtitle: isSelectionMode
          ? "Select items to approve/reject"
          : `${pagination.total} discrepancies found`,
        customRightContent: (
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
        ),
        toolbar: (
          <OperationalStatusStrip
            compact
            offline={offlineMode}
            syncState={loading ? "Loading" : offlineMode ? "Paused" : "Ready"}
            pendingQueueCount={variances.length}
            runtimeHealth={offlineMode ? "Degraded" : "Stable"}
            items={[
              {
                id: "selected-variances",
                label: "Selected",
                value: selectedIds.size,
                tone: selectedIds.size > 0 ? "active" : "neutral",
                icon: "checkbox-outline",
              },
              {
                id: "critical-variance",
                label: "Critical",
                value: criticalVarianceCount,
                tone: criticalVarianceCount > 0 ? "error" : "success",
                icon: "alert-circle-outline",
              },
              {
                id: "total-variances",
                label: "Total",
                value: pagination.total,
                tone: "info",
                icon: "analytics-outline",
              },
            ]}
            style={styles.statusStrip}
            testID="variances-operational-status-strip"
          />
        ),
      }}
    >
      <StatusBar style="light" />
      <View style={styles.container}>
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

        <OperationalStatusStrip
          compact
          offline={offlineMode}
          syncState={loading ? "Loading" : offlineMode ? "Paused" : "Ready"}
          pendingQueueCount={variances.length}
          runtimeHealth={offlineMode ? "Degraded" : "Stable"}
          items={[
            {
              id: "selected-variances",
              label: "Selected",
              value: selectedIds.size,
              tone: selectedIds.size > 0 ? "active" : "neutral",
              icon: "checkbox-outline",
            },
            {
              id: "critical-variance",
              label: "Critical",
              value: criticalVarianceCount,
              tone: criticalVarianceCount > 0 ? "error" : "success",
              icon: "alert-circle-outline",
            },
            {
              id: "total-variances",
              label: "Total",
              value: pagination.total,
              tone: "info",
              icon: "analytics-outline",
            },
          ]}
          style={styles.statusStrip}
          testID="variances-operational-status-strip"
        />

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
          <OperationalSplitView
            collapsible
            persistSelection={false}
            sidebarLabel="Variance queue"
            detailLabel={
              selectedVariance
                ? `Variance detail for ${selectedVariance.item_code}`
                : "Variance detail"
            }
            style={styles.splitView}
            sidebar={
              <OperationalListSection
                title="Variance queue"
                subtitle={`${variances.length} visible of ${pagination.total} discrepancies`}
                severity={variances.length > 0 ? "high" : "none"}
                style={styles.listSection}
                contentStyle={styles.sectionListContent}
              >
                <FlashList
                  data={variances}
                  renderItem={renderVarianceItem}
                  drawDistance={OPERATIONAL_LIST_ROW_ESTIMATED_HEIGHT.standard * 6}
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
              </OperationalListSection>
            }
            detail={varianceDetailPanel}
          />
        )}
      </View>

      {/* Bulk Action Bar */}
      {isSelectionMode && (
        <Animated.View entering={bulkEntry} style={styles.bulkActionBar}>
          <OperationalCommandBar
            compact
            align="stretch"
            title={`${selectedIds.size} selected`}
            subtitle="Cmd/Ctrl+V approves. Cmd/Ctrl+Shift+R rejects."
            actions={bulkCommandActions}
            style={styles.bulkCommandBar}
          />
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
    marginBottom: theme.spacing.sm,
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
  rowSpacing: {
    marginBottom: theme.spacing.sm,
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
  splitView: {
    flex: 1,
    minHeight: 0,
  },
  statusStrip: {
    marginBottom: theme.spacing.sm,
  },
  listSection: {
    flex: 1,
    minHeight: 240,
  },
  sectionListContent: {
    flex: 1,
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
  bulkCommandBar: {
    width: "100%",
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
