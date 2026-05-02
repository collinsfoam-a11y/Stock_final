import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import ModernCard from "@/components/ui/ModernCard";
import ModernInput from "@/components/ui/ModernInput";
import { getStockQty } from "@/utils/itemBatchUtils";
import {
  borderRadius,
  colors,
  spacing,
  typography,
} from "@/theme/unified";

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
  const hasSavedQty = typeof item.counted_qty === "number" && !Number.isNaN(item.counted_qty);

  return (
    <ModernCard style={styles.recentCard} onPress={onPress}>
      <View style={styles.recentRow}>
        <View style={styles.recentIcon}>
          <Ionicons
            name={hasSavedQty ? "checkmark-circle" : "cube-outline"}
            size={22}
            color={hasSavedQty ? colors.success[600] : colors.primary[600]}
          />
        </View>
        <View style={styles.recentInfo}>
          <Text style={styles.recentName} numberOfLines={1}>
            {item.item_name}
          </Text>
          <Text style={styles.recentCode}>
            {item.item_code}
            {hasSavedQty ? `  •  Qty ${item.counted_qty}` : ""}
          </Text>
        </View>
        {hasSavedQty ? (
          <View style={styles.savedBadge}>
            <Text style={styles.savedBadgeText}>Saved</Text>
          </View>
        ) : null}
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
    <TouchableOpacity style={styles.resultItem} onPress={onPress} activeOpacity={0.7}>
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
      <ModernCard variant="outlined" elevation="none" style={styles.commandCard}>
        <View style={styles.commandHeader}>
          <View style={styles.commandCopy}>
            <Text style={styles.commandEyebrow}>Scan or Search</Text>
            <Text style={styles.commandTitle}>
              Capture a barcode fast or enter an item code for manual lookup
            </Text>
          </View>

          <TouchableOpacity
            style={styles.commandScanButton}
            onPress={onOpenScanner}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Open barcode scanner"
          >
            <Ionicons name="scan" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>

        <View style={styles.commandStatusRow}>
          <View style={styles.commandStatusChip}>
            <Ionicons
              name="layers-outline"
              size={14}
              color={colors.primary[700]}
            />
            <Text style={styles.commandStatusText}>
              Recent scans stay available for quick re-entry
            </Text>
          </View>
        </View>
      </ModernCard>

      <View style={styles.searchSection}>
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrapper}>
            <ModernInput
              placeholder="Barcode or item code"
              value={searchQuery}
              onChangeText={onChangeSearchQuery}
              icon="search"
              rightIcon={searchQuery ? "close-circle" : undefined}
              onRightIconPress={onClearSearchQuery}
              onSubmitEditing={onSubmitSearch}
              returnKeyType="search"
              keyboardType="default"
              autoFocus={Platform.OS === "web"}
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
                <SearchResultItem item={item} onPress={() => onPressItem(item)} />
                {index < searchResults.length - 1 && <View style={styles.searchResultSeparator} />}
              </React.Fragment>
            ))}
          </View>
        )}
      </View>

      {searchResults.length === 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Recent Items</Text>
          <Text style={styles.sectionSubtitle}>
            Reopen the last few items without rescanning them.
          </Text>

          {initialLoading ? (
            <>
              {[1, 2, 3].map((value) => (
                <ModernCard key={value} style={styles.recentCard}>
                  <View style={styles.recentRow}>
                    <SkeletonLoader style={{ width: 44, height: 44, borderRadius: 12 }} />
                    <View style={[styles.recentInfo, { marginLeft: spacing.md }]}>
                      <SkeletonLoader style={{ width: "80%", height: 16, borderRadius: 4 }} />
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
              title="No Saved Scans Yet"
              subtitle="Your last counted items will appear here for quick access"
            />
          ) : (
            <View style={styles.recentListContainer}>
              {recentItems.slice(0, 3).map((item, index) => (
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
  commandCard: {
    marginBottom: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  commandHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  commandCopy: {
    flex: 1,
  },
  commandEyebrow: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[700],
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  commandTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
    lineHeight: 22,
  },
  commandScanButton: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[700],
    alignItems: "center",
    justifyContent: "center",
  },
  commandStatusRow: {
    marginTop: spacing.md,
  },
  commandStatusChip: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[50],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
  },
  commandStatusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[700],
  },
  searchSection: {
    marginBottom: spacing.xl,
    padding: spacing.lg,
    backgroundColor: SURFACE_CARD,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    ...shadows.md,
  },
  panelKicker: {
    fontSize: typography.fontSize.xs,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: ACCENT,
    marginBottom: spacing.xs,
  },
  panelTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: "700",
    color: TEXT_STRONG,
    marginBottom: spacing.xs,
  },
  panelCopy: {
    fontSize: typography.fontSize.sm,
    lineHeight: 22,
    color: TEXT_MUTED,
    marginBottom: spacing.md,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  primaryScanButton: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  primaryScanButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.base,
    fontWeight: "800",
  },
  searchInputWrapper: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  searchButton: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[600],
    alignItems: "center",
    justifyContent: "center",
  },
  searchButtonDisabled: {
    backgroundColor: colors.gray[300],
  },
  searchResultsContainer: {
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  searchResultSeparator: {
    height: 1,
    backgroundColor: colors.gray[200],
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
    color: TEXT_STRONG,
  },
  resultCode: {
    fontSize: typography.fontSize.xs,
    color: TEXT_MUTED,
  },
  resultStock: {
    marginTop: 2,
    fontSize: typography.fontSize.xs,
    color: ACCENT,
    fontWeight: typography.fontWeight.semibold,
  },
  recentSection: {
    marginBottom: spacing.lg,
  },
  sectionCopy: {
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
    color: TEXT_MUTED,
    marginBottom: spacing.md,
  },
  recentListContainer: {
    paddingBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: "700",
    color: colors.gray[600],
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginLeft: spacing.xs,
  },
  sectionSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  recentCard: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  recentIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: ACCENT_SOFT,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  recentInfo: {
    flex: 1,
  },
  savedBadge: {
    marginRight: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  savedBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: "700",
    color: colors.success[600],
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  recentName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: TEXT_STRONG,
    marginBottom: 2,
  },
  recentCode: {
    fontSize: typography.fontSize.xs,
    color: TEXT_MUTED,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: SURFACE_CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: ACCENT_SOFT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: TEXT_STRONG,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.sm,
    color: TEXT_MUTED,
    textAlign: "center",
    lineHeight: 20,
  },
  skeleton: {
    backgroundColor: colors.gray[200],
    overflow: "hidden",
  },
});
