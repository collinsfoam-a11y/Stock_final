import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import ModernCard from "@/components/ui/ModernCard";
import ModernInput from "@/components/ui/ModernInput";
import { getStockQty } from "@/utils/itemBatchUtils";
import {
  borderRadius,
  colors,
  shadows,
  spacing,
  typography,
} from "@/theme/modernDesign";

type ScanLookupItem = {
  _id?: string | number;
  barcode?: string;
  id?: string | number;
  item_code?: string;
  item_name?: string;
} & Record<string, any>;

interface ScanLookupPanelProps {
  initialLoading: boolean;
  loading: boolean;
  recentItems: ScanLookupItem[];
  searchQuery: string;
  searchResults: ScanLookupItem[];
  onChangeSearchQuery: (value: string) => void;
  onClearSearchQuery: () => void;
  onOpenScanner: () => void;
  onPressItem: (item: ScanLookupItem) => void;
  onSubmitSearch: () => void;
}

function SkeletonLoader({ style }: { style?: object }) {
  return <View style={[styles.skeleton, style]} />;
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  subtitle: string;
  title: string;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name={icon} size={48} color={colors.gray[300]} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

function buildItemKey(item: ScanLookupItem, index: number) {
  const code = item?.item_code ?? "no-code";
  const barcode = item?.barcode ?? "no-barcode";
  const id = item?.id ?? item?._id ?? "no-id";
  return `${code}-${barcode}-${id}-${index}`;
}

const RecentItemCard = React.memo(function RecentItemCard({
  item,
  onPress,
}: {
  item: ScanLookupItem;
  onPress: () => void;
}) {
  return (
    <ModernCard style={styles.recentCard} onPress={onPress}>
      <View style={styles.recentRow}>
        <View style={styles.recentIcon}>
          <Ionicons name="cube-outline" size={22} color={colors.primary[600]} />
        </View>
        <View style={styles.recentInfo}>
          <Text style={styles.recentName} numberOfLines={1}>
            {item.item_name}
          </Text>
          <Text style={styles.recentCode}>{item.item_code}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.gray[400]} />
      </View>
    </ModernCard>
  );
});

const SearchResultItem = React.memo(function SearchResultItem({
  item,
  onPress,
}: {
  item: ScanLookupItem;
  onPress: () => void;
}) {
  const stockQty = getStockQty(item);

  return (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name="cube-outline" size={20} color={colors.primary[600]} />
      <View style={styles.resultInfo}>
        <Text style={styles.resultName}>{item.item_name}</Text>
        <Text style={styles.resultCode}>{item.item_code}</Text>
        <Text style={styles.resultStock}>Stock: {stockQty}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.gray[400]} />
    </TouchableOpacity>
  );
});

RecentItemCard.displayName = "RecentItemCard";
SearchResultItem.displayName = "SearchResultItem";

export function ScanLookupPanel({
  initialLoading,
  loading,
  recentItems,
  searchQuery,
  searchResults,
  onChangeSearchQuery,
  onClearSearchQuery,
  onOpenScanner,
  onPressItem,
  onSubmitSearch,
}: ScanLookupPanelProps) {
  return (
    <>
      <View style={styles.searchSection}>
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrapper}>
            <ModernInput
              placeholder="Enter barcode or item code..."
              value={searchQuery}
              onChangeText={onChangeSearchQuery}
              icon="search"
              rightIcon={searchQuery ? "close-circle" : undefined}
              onRightIconPress={onClearSearchQuery}
              onSubmitEditing={onSubmitSearch}
              returnKeyType="search"
              keyboardType="default"
              containerStyle={{ marginBottom: 0 }}
            />
          </View>
          <TouchableOpacity
            style={[styles.searchButton, loading && styles.searchButtonDisabled]}
            testID="scan-search-submit"
            onPress={searchQuery.trim() ? onSubmitSearch : onOpenScanner}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Ionicons
              name={searchQuery.trim() ? "arrow-forward" : "scan"}
              size={24}
              color={colors.white}
            />
          </TouchableOpacity>
        </View>

        {searchResults.length > 0 && (
          <View style={styles.searchResultsContainer}>
            {searchResults.map((item, index) => (
              <React.Fragment key={buildItemKey(item, index)}>
                <SearchResultItem
                  item={item}
                  onPress={() => onPressItem(item)}
                />
                {index < searchResults.length - 1 && (
                  <View style={styles.searchResultSeparator} />
                )}
              </React.Fragment>
            ))}
          </View>
        )}
      </View>

      {searchResults.length === 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Recent Items</Text>

          {initialLoading ? (
            <>
              {[1, 2, 3].map((value) => (
                <ModernCard key={value} style={styles.recentCard}>
                  <View style={styles.recentRow}>
                    <SkeletonLoader
                      style={{ width: 44, height: 44, borderRadius: 12 }}
                    />
                    <View style={[styles.recentInfo, { marginLeft: spacing.md }]}>
                      <SkeletonLoader
                        style={{ width: "80%", height: 16, borderRadius: 4 }}
                      />
                      <SkeletonLoader
                        style={{
                          width: "50%",
                          height: 12,
                          marginTop: 6,
                          borderRadius: 4,
                        }}
                      />
                    </View>
                  </View>
                </ModernCard>
              ))}
            </>
          ) : recentItems.length === 0 ? (
            <EmptyState
              icon="time-outline"
              title="No Recent Scans"
              subtitle="Items you scan will appear here for quick access"
            />
          ) : (
            <View style={styles.recentListContainer}>
              {recentItems.slice(0, 5).map((item, index) => (
                <RecentItemCard
                  key={buildItemKey(item, index)}
                  item={item}
                  onPress={() => onPressItem(item)}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  searchSection: {
    marginBottom: spacing.xl,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  searchInputWrapper: {
    flex: 1,
    ...shadows.sm,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
  },
  searchButton: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[600],
    alignItems: "center",
    justifyContent: "center",
    ...shadows.md,
  },
  searchButtonDisabled: {
    backgroundColor: colors.gray[300],
    shadowOpacity: 0,
  },
  searchResultsContainer: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    ...shadows.lg,
    zIndex: 200,
    elevation: 10,
  },
  searchResultSeparator: {
    height: 1,
    backgroundColor: colors.gray[100],
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  resultInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  resultName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.gray[900],
  },
  resultCode: {
    fontSize: typography.fontSize.xs,
    color: colors.gray[500],
  },
  resultStock: {
    marginTop: 2,
    fontSize: typography.fontSize.xs,
    color: colors.primary[700],
    fontWeight: typography.fontWeight.semibold,
  },
  recentSection: {
    marginBottom: spacing.lg,
  },
  recentListContainer: {
    paddingBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: "700",
    color: colors.gray[500],
    marginBottom: spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginLeft: spacing.xs,
  },
  recentCard: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.white,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.gray[100],
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  recentIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  recentInfo: {
    flex: 1,
  },
  recentName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[900],
    marginBottom: 2,
  },
  recentCode: {
    fontSize: typography.fontSize.xs,
    color: colors.gray[500],
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.gray[100],
    borderStyle: "dashed",
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray[50],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[900],
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
    textAlign: "center",
    lineHeight: 20,
  },
  skeleton: {
    backgroundColor: colors.gray[200],
    overflow: "hidden",
  },
});
