import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import ModernCard from "@/components/ui/ModernCard";
import ModernInput from "@/components/ui/ModernInput";
import { getStockQty } from "@/utils/itemBatchUtils";
import { borderRadius, colors, shadows, spacing, typography } from "@/theme/modernDesign";

const SURFACE_CARD = "#ffffff";
const SURFACE_BORDER = "#d9e5e2";
const SURFACE_MUTED = "#f8fafc";
const ACCENT = "#0f766e";
const ACCENT_SOFT = "#ecf7f4";
const TEXT_STRONG = "#0f172a";
const TEXT_MUTED = "#475569";

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
      <View style={styles.searchSectionCard}>
        <Text style={styles.panelKicker}>Find an item</Text>
        <Text style={styles.panelTitle}>Scan item now</Text>
        <Text style={styles.panelCopy}>
          Use the camera first. Type the barcode or item code only when the label is worn or
          unavailable.
        </Text>

        <TouchableOpacity
          style={[styles.primaryScanButton, loading && styles.searchButtonDisabled]}
          onPress={onOpenScanner}
          disabled={loading}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Open barcode scanner"
        >
          <Ionicons name="scan" size={24} color={colors.white} />
          <Text style={styles.primaryScanButtonText}>Scan Item</Text>
        </TouchableOpacity>

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
          <Text style={styles.sectionTitle}>Last 3 saved scans</Text>
          <Text style={styles.sectionCopy}>
            Reopen the latest counted items without scanning them again.
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
  searchSectionCard: {
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
    backgroundColor: SURFACE_CARD,
    borderRadius: 14,
  },
  searchButton: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.md,
  },
  searchButtonDisabled: {
    backgroundColor: colors.gray[300],
    boxShadow: "none",
  },
  searchResultsContainer: {
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: SURFACE_MUTED,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
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
    color: TEXT_STRONG,
    marginBottom: spacing.xs,
  },
  recentCard: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    backgroundColor: SURFACE_CARD,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: "#e2e8f0",
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
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
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
