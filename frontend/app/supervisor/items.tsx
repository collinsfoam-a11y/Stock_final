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
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { getLocalItems } from "../../src/db/localDb";
import { ItemVerificationAPI } from "../../src/domains/inventory/services/itemVerificationApi";
import {
  ItemFilters,
  FilterValues,
} from "../../src/domains/inventory/components/ItemFilters";
import { useSettingsStore } from "../../src/store/settingsStore";
import {
  ScreenContainer,
  GlassCard,
  StatsCard,
  AnimatedPressable,
} from "../../src/components/ui";
import { theme } from "../../src/styles/modernDesignSystem";
import { saveArrayBufferExport } from "../../src/utils/fileExport";

const filterCachedItems = (items: any[], filters: FilterValues) => {
  const search = filters.search?.trim().toLowerCase();

  return items.filter((item) => {
    if (typeof filters.verified === "boolean" && item.verified !== filters.verified) {
      return false;
    }

    if (search) {
      const haystack = [
        item.item_name,
        item.item_code,
        item.barcode,
        item.category,
      ]
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

export default function ItemsScreen() {
  const router = useRouter();
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
    [filters, offlineMode, pagination.limit, pagination.skip],
  );

  useEffect(() => {
    loadItems(true);
  }, [loadItems]);

  const handleRefresh = () => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        format,
      );
      const filename = `items_erpnext_import_${new Date().toISOString().split("T")[0]}.${format}`;

      await saveArrayBufferExport(
        fileData,
        filename,
        format === "csv"
          ? "text/csv"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
        style={{ marginBottom: theme.spacing.sm }}
      >
        <GlassCard
          intensity={15}
          padding={theme.spacing.md}
          borderRadius={theme.borderRadius.lg}
        >
          <View style={styles.itemHeader}>
            <View style={styles.itemHeaderLeft}>
              <Text style={styles.itemName}>{item.item_name}</Text>
              <Text style={styles.itemCode}>{item.item_code}</Text>
            </View>
            {item.verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={theme.colors.success.main}
                />
              </View>
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
              <Text style={styles.detailValue}>
                ₹{item.mrp?.toFixed(2) || "0.00"}
              </Text>
            </View>
          </View>

          {(item.floor || item.rack) && (
            <View style={styles.locationRow}>
              <Ionicons
                name="location-outline"
                size={14}
                color={theme.colors.text.tertiary}
              />
              <Text style={styles.locationText}>
                {[item.floor, item.rack].filter(Boolean).join(" / ")}
              </Text>
            </View>
          )}

          {item.category && (
            <View style={{ marginTop: 4 }}>
              <Text style={styles.categoryText}>
                {item.category}
                {item.subcategory && ` • ${item.subcategory}`}
              </Text>
            </View>
          )}

          {item.verified && item.verified_by && (
            <View style={styles.verificationInfo}>
              <Ionicons
                name="person-outline"
                size={12}
                color={theme.colors.text.tertiary}
              />
              <Text style={styles.verificationInfoText}>
                Verified by {item.verified_by}
                {item.verified_at &&
                  ` • ${new Date(item.verified_at).toLocaleDateString()}`}
              </Text>
            </View>
          )}
        </GlassCard>
      </AnimatedPressable>
    );
  };

  return (
    <ScreenContainer>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Header */}
        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          style={styles.header}
        >
          <View style={styles.headerLeft}>
            <AnimatedPressable
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={theme.colors.text.primary}
              />
            </AnimatedPressable>
            <View>
              <Text style={styles.pageTitle}>Items</Text>
              <Text style={styles.pageSubtitle}>
                {pagination.total} items listed
              </Text>
            </View>
          </View>

          <View style={styles.exportActions}>
            <AnimatedPressable
              style={[
                styles.exportFormatButton,
                items.length === 0 && { opacity: 0.5 },
              ]}
              onPress={() => void handleExport("csv")}
              disabled={items.length === 0}
            >
              <GlassCard
                intensity={20}
                padding={8}
                borderRadius={theme.borderRadius.full}
              >
                <Text style={styles.exportFormatLabel}>CSV</Text>
              </GlassCard>
            </AnimatedPressable>
            <AnimatedPressable
              style={[
                styles.exportFormatButton,
                items.length === 0 && { opacity: 0.5 },
              ]}
              onPress={() => void handleExport("xlsx")}
              disabled={items.length === 0}
            >
              <GlassCard
                intensity={20}
                padding={8}
                borderRadius={theme.borderRadius.full}
              >
                <Text style={styles.exportFormatLabel}>XLSX</Text>
              </GlassCard>
            </AnimatedPressable>
          </View>
        </Animated.View>

        {/* Statistics Cards */}
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          style={styles.statsContainer}
        >
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

        {offlineMode && (
          <GlassCard
            intensity={10}
            padding={theme.spacing.sm}
            style={{ marginBottom: theme.spacing.md }}
          >
            <Text style={styles.offlineNoticeTitle}>Offline mode enabled</Text>
            <Text style={styles.offlineNoticeBody}>
              This screen is showing cached items only. Stock, MRP, and location
              fields may be incomplete until you reconnect.
            </Text>
          </GlassCard>
        )}

        {!offlineMode && (
          <GlassCard
            intensity={8}
            padding={theme.spacing.sm}
            style={{ marginBottom: theme.spacing.md }}
          >
            <Text style={styles.exportHintTitle}>ERPNext import format</Text>
            <Text style={styles.exportHintBody}>
              Blank ID inserts new rows. Keep ID to update existing ERPNext
              records.
            </Text>
          </GlassCard>
        )}

        {/* Filters */}
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <GlassCard
            intensity={10}
            padding={theme.spacing.sm}
            style={{ marginBottom: theme.spacing.md }}
          >
            <ItemFilters
              onFilterChange={setFilters}
              showVerifiedFilter={true}
              showSearch={true}
            />
          </GlassCard>
        </Animated.View>

        {items.length === 0 && !loading ? (
          <View style={styles.centered}>
            <Ionicons
              name="cube-outline"
              size={64}
              color={theme.colors.text.tertiary}
            />
            <Text style={styles.emptyText}>No items found</Text>
            <Text style={styles.emptySubtext}>Try adjusting your filters</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
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
                  tintColor={theme.colors.primary[500]}
                  colors={[theme.colors.primary[500]]}
                />
              }
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                loading && items.length > 0 ? (
                  <View style={{ paddingVertical: 20 }}>
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.primary[500]}
                    />
                  </View>
                ) : (
                  <View style={{ height: 20 }} />
                )
              }
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
  backButton: {
    padding: theme.spacing.xs,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
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
  statsContainer: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  listContent: {
    paddingBottom: theme.spacing.xl,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: theme.spacing.sm,
  },
  itemHeaderLeft: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text.primary,
    marginBottom: 4,
  },
  itemCode: {
    fontSize: 14,
    color: theme.colors.text.tertiary,
  },
  verifiedBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.15)", // Emerald color with opacity
    borderRadius: theme.borderRadius.full,
    padding: 4,
  },
  itemDetails: {
    flexDirection: "row",
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  detailRow: {
    //
  },
  detailLabel: {
    fontSize: 12,
    color: theme.colors.text.tertiary,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text.primary,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginBottom: 4, // Added margin bottom for spacing
  },
  locationText: {
    fontSize: 12,
    color: theme.colors.text.secondary,
  },
  categoryText: {
    fontSize: 12,
    color: theme.colors.text.tertiary,
    fontStyle: "italic",
  },
  verificationInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    paddingTop: theme.spacing.xs,
  },
  verificationInfoText: {
    fontSize: 12,
    color: theme.colors.text.tertiary,
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
  offlineNoticeTitle: {
    color: theme.colors.text.primary,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
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
    marginBottom: 4,
  },
  exportHintBody: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
});
