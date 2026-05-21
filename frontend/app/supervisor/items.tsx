/**
 * Filtered Items Screen
 * View and filter all items with category, subcategory, floor, rack, UOM filters
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
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { getLocalItems } from "../../src/db/localDb";
import { ItemVerificationAPI } from "../../src/domains/inventory/services/itemVerificationApi";
import { ItemFilters, FilterValues } from "../../src/domains/inventory/components/ItemFilters";
import { useSettingsStore } from "../../src/store/settingsStore";
import {
  ScreenContainer,
  ModernCard,
  StatsCard,
  AnimatedPressable,
  ModernButton,
  EmptyState,
  InlineAlert,
  StatusBadge,
} from "../../src/components/ui";
import { useUiTokens } from "../../src/hooks/useUiTokens";
import { type ThemeTokens } from "../../src/theme/themeTokens";
import { saveArrayBufferExport } from "../../src/utils/fileExport";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { colorWithAlpha } from "@/theme/themeTokens";

const filterCachedItems = (items: any[], filters: FilterValues) => {
  const search = filters.search?.trim().toLowerCase();

  return items.filter((item) => {
    if (typeof filters.verified === "boolean" && item.verified !== filters.verified) {
      return false;
    }

    if (search) {
      const haystack = [item.item_name, item.item_code, item.barcode, item.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(search)) {
        return false;
      }
    }

    return true;
  });
};

const createStyles = (uiTokens: ThemeTokens) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      paddingHorizontal: uiTokens.spacing.md,
    },
    container: {
      flex: 1,
    },
    alert: {
      marginBottom: uiTokens.spacing.md,
    },
    filterCardWrapper: {
      marginBottom: uiTokens.spacing.md,
    },
    exportActions: {
      flexDirection: "row",
      gap: uiTokens.spacing.xs,
    },
    exportButton: {
      minWidth: 110,
    },
    statsContainer: {
      flexDirection: "row",
      gap: uiTokens.spacing.sm,
      marginBottom: uiTokens.spacing.md,
    },
    listContent: {
      paddingBottom: uiTokens.spacing.xl,
    },
    listWrap: {
      flex: 1,
    },
    itemPressable: {
      marginBottom: uiTokens.spacing.sm,
    },
    itemHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: uiTokens.spacing.sm,
    },
    itemHeaderLeft: {
      flex: 1,
    },
    itemName: {
      fontSize: 16,
      fontWeight: "600",
      color: uiTokens.colors.textPrimary,
      marginBottom: uiTokens.spacing.xs,
    },
    itemCode: {
      fontSize: 14,
      color: uiTokens.colors.textMuted,
    },
    verifiedBadge: {
      backgroundColor: colorWithAlpha(uiTokens.colors.success, 0.15),
      borderRadius: uiTokens.radius.full,
      padding: uiTokens.spacing.xs,
    },
    itemDetails: {
      flexDirection: "row",
      gap: uiTokens.spacing.lg,
      marginBottom: uiTokens.spacing.sm,
      backgroundColor: colorWithAlpha(uiTokens.colors.textPrimary, 0.03),
      padding: uiTokens.spacing.xs,
      borderRadius: uiTokens.radius.sm,
    },
    detailRow: {
      flex: 1,
      minWidth: 0,
    },
    detailLabel: {
      fontSize: 12,
      color: uiTokens.colors.textMuted,
      marginBottom: uiTokens.spacing.xs,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    detailValue: {
      fontSize: 14,
      fontWeight: "600",
      color: uiTokens.colors.textPrimary,
    },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: uiTokens.spacing.xs,
      marginBottom: uiTokens.spacing.xs,
    },
    locationText: {
      fontSize: 12,
      color: uiTokens.colors.textSecondary,
    },
    categoryText: {
      fontSize: 12,
      color: uiTokens.colors.textMuted,
      fontStyle: "italic",
    },
    categoryWrap: {
      marginTop: uiTokens.spacing.xs,
    },
    verificationInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: uiTokens.spacing.xs,
      marginTop: uiTokens.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colorWithAlpha(uiTokens.colors.textPrimary, 0.05),
      paddingTop: uiTokens.spacing.xs,
    },
    verificationInfoText: {
      fontSize: 12,
      color: uiTokens.colors.textMuted,
    },
    emptyState: {
      marginTop: uiTokens.spacing.xl,
    },
    footerLoader: {
      paddingVertical: uiTokens.spacing.xl,
    },
    footerSpacer: {
      height: uiTokens.spacing.xl,
    },
  });

export default function ItemsScreen() {
  const uiTokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<FilterValues>({});
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 100,
    skip: 0,
  });
  const [statistics, setStatistics] = useState({
    total_items: 0,
    verified_items: 0,
    unverified_items: 0,
    total_qty: 0,
  });
  const statsEntry = prefersReducedMotion ? undefined : FadeInDown.delay(200).springify();
  const filtersEntry = prefersReducedMotion ? undefined : FadeInDown.delay(300).springify();

  const styles = React.useMemo(() => createStyles(uiTokens), [uiTokens]);
  const loadItems = React.useCallback(
    async (reset = false) => {
      try {
        if (reset) {
          setLoading(true);
          setPagination((prev) => ({ ...prev, skip: 0 }));
        }

        if (offlineMode) {
          const localItems = await getLocalItems();
          const mappedItems = localItems.map((item) => ({
            id: item.barcode,
            item_code: item.barcode,
            item_name: item.name,
            barcode: item.barcode,
            category: item.category,
            verified: Boolean(item.verified),
            stock_qty: 0,
            mrp: 0,
            last_sync: item.last_sync,
          }));
          const filteredItems = filterCachedItems(mappedItems, filters);

          setItems(filteredItems);
          setPagination({
            total: filteredItems.length,
            limit: filteredItems.length || 100,
            skip: 0,
          });
          setStatistics({
            total_items: filteredItems.length,
            verified_items: filteredItems.filter((item) => item.verified).length,
            unverified_items: filteredItems.filter((item) => !item.verified).length,
            total_qty: 0,
          });
          return;
        }

        const skip = reset ? 0 : pagination.skip;
        const response = await ItemVerificationAPI.getFilteredItems({
          ...filters,
          limit: pagination.limit,
          skip,
        });

        if (reset) {
          setItems(response.items);
        } else {
          setItems((prev) => [...prev, ...response.items]);
        }

        setPagination(response.pagination);
        setStatistics(response.statistics);
      } catch (error: any) {
        Alert.alert("Error", error.message || "Failed to load items");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters, offlineMode, pagination.limit, pagination.skip]
  );

  useEffect(() => {
    loadItems(true);
  }, [loadItems]);

  const handleRefresh = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    loadItems(true);
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
      loadItems(false);
    }
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    try {
      if (items.length === 0) {
        Alert.alert("No Data", "There are no items to export");
        return;
      }

      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const fileData = await ItemVerificationAPI.exportItemsToERPNext(
        {
          ...filters,
          verified: filters.verified,
        },
        format
      );
      const filename = `items_erpnext_import_${new Date().toISOString().split("T")[0]}.${format}`;

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

  const renderItem = ({ item }: { item: any }) => {
    return (
      <AnimatedPressable
        onPress={() => {
          // Could navigate to item detail
          if (Platform.OS !== "web") Haptics.selectionAsync();
        }}
        style={styles.itemPressable}
        accessibilityLabel={`${item.item_name || item.item_code}, stock ${item.stock_qty?.toFixed(2) || "0.00"} ${item.uom_name || ""}${item.verified ? ", verified" : ""}`}
        accessibilityHint="Shows item information"
      >
        <ModernCard intensity={15} padding={uiTokens.spacing.md}>
          <View style={styles.itemHeader}>
            <View style={styles.itemHeaderLeft}>
              <Text style={styles.itemName}>{item.item_name}</Text>
              <Text style={styles.itemCode}>{item.item_code}</Text>
            </View>
            {item.verified && (
              <StatusBadge
                label="Verified"
                variant="success"
                size="small"
                icon="checkmark-circle"
                style={styles.verifiedBadge}
              />
            )}
          </View>

          <View style={styles.itemDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Stock</Text>
              <Text style={styles.detailValue}>
                {item.stock_qty?.toFixed(2) || "0.00"} {item.uom_name || ""}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>MRP</Text>
              <Text style={styles.detailValue}>₹{item.mrp?.toFixed(2) || "0.00"}</Text>
            </View>
          </View>

          {(item.floor || item.rack) && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color={uiTokens.colors.textMuted} />
              <Text style={styles.locationText}>
                {[item.floor, item.rack].filter(Boolean).join(" / ")}
              </Text>
            </View>
          )}

          {item.category && (
            <View style={styles.categoryWrap}>
              <Text style={styles.categoryText}>
                {item.category}
                {item.subcategory && ` • ${item.subcategory}`}
              </Text>
            </View>
          )}

          {item.verified && item.verified_by && (
            <View style={styles.verificationInfo}>
              <Ionicons name="person-outline" size={12} color={uiTokens.colors.textMuted} />
              <Text style={styles.verificationInfoText}>
                Verified by {item.verified_by}
                {item.verified_at && ` • ${new Date(item.verified_at).toLocaleDateString()}`}
              </Text>
            </View>
          )}
        </ModernCard>
      </AnimatedPressable>
    );
  };

  return (
    <ScreenContainer
      header={{
        title: "Items",
        subtitle: `${pagination.total} items listed`,
        showBackButton: true,
        customRightContent: (
          <View style={styles.exportActions}>
            <ModernButton
              title="CSV"
              onPress={() => void handleExport("csv")}
              variant="secondary"
              size="small"
              icon="download-outline"
              iconPosition="left"
              disabled={items.length === 0}
              style={styles.exportButton}
            />
            <ModernButton
              title="XLSX"
              onPress={() => void handleExport("xlsx")}
              variant="secondary"
              size="small"
              icon="document-text-outline"
              iconPosition="left"
              disabled={items.length === 0}
              style={styles.exportButton}
            />
          </View>
        ),
      }}
      backgroundType="solid"
      contentMode="static"
      style={styles.screen}
      loading={loading && items.length === 0}
      loadingText="Loading item list..."
    >
      <View style={styles.container}>
        <Animated.View entering={statsEntry} style={styles.statsContainer}>
          <StatsCard
            title="Total Items"
            value={statistics.total_items.toString()}
            icon="cube-outline"
            variant="primary"
            style={{ flex: 1 }}
          />
          <StatsCard
            title="Verified"
            value={statistics.verified_items.toString()}
            icon="checkmark-done-circle-outline"
            variant="success"
            style={{ flex: 1 }}
          />
          <StatsCard
            title="Total Qty"
            value={statistics.total_qty.toFixed(0)}
            icon="layers-outline"
            variant="warning"
            style={{ flex: 1 }}
          />
        </Animated.View>

        {offlineMode ? (
          <View style={styles.alert}>
            <InlineAlert
              type="warning"
              message="Offline mode enabled. This view shows cached items only."
            />
          </View>
        ) : (
          <View style={styles.alert}>
            <InlineAlert type="info" message="ERPNext import format applies when exporting data." />
          </View>
        )}

        <Animated.View entering={filtersEntry} style={styles.filterCardWrapper}>
          <ModernCard intensity={10} padding={uiTokens.spacing.sm}>
            <ItemFilters onFilterChange={setFilters} showVerifiedFilter showSearch />
          </ModernCard>
        </Animated.View>

        {items.length === 0 && !loading ? (
          <EmptyState
            icon="cube-outline"
            title="No items found"
            message="Try adjusting your filters or search criteria."
            style={styles.emptyState}
          />
        ) : (
          <View style={styles.listWrap}>
            <FlashList
              data={items}
              renderItem={renderItem}
              // @ts-ignore
              estimatedItemSize={150}
              keyExtractor={(item, index) => `${item.item_code}-${index}`}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={uiTokens.colors.accent}
                  colors={[uiTokens.colors.accent]}
                />
              }
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                loading && items.length > 0 ? (
                  <View style={styles.footerLoader}>
                    <ActivityIndicator size="small" color={uiTokens.colors.accent} />
                  </View>
                ) : (
                  <View style={styles.footerSpacer} />
                )
              }
            />
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}
