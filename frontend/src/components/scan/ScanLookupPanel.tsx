import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import ModernCard from "@/components/ui/ModernCard";
import ModernInput from "@/components/ui/ModernInput";
import { getStockQty } from "@/utils/itemBatchUtils";
import { borderRadius, colors, spacing, typography } from "@/theme/legacyCompat";

import { useUiTokens } from "@/hooks/useUiTokens";
import { getAccessibleButtonProps } from "@/utils/accessibility";
import { ScannerFeedbackState } from "@/components/feedback/ScannerFeedbackState";
import type { ScannerFeedbackStateValue } from "@/components/feedback/ScannerFeedbackState";

export type ScanLookupNotice = {
  actionLabel?: string;
  message: string;
  title: string;
  type: "error" | "warning" | "info";
};

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
  notice?: ScanLookupNotice | null;
  onChangeSearchQuery: (value: string) => void;
  onClearSearchQuery: () => void;
  onDismissNotice?: () => void;
  onOpenScanner: () => void;
  onPressItem: (item: ScanLookupItem) => void;
  onRetryNotice?: () => void;
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
  const uiTokens = useUiTokens();
  const iconWash = uiTokens.mode === "dark" ? "rgba(88, 166, 255, 0.14)" : colors.primary[50];

  return (
    <View
      style={[
        styles.emptyState,
        {
          backgroundColor: uiTokens.colors.surface,
          borderColor: uiTokens.colors.border,
        },
      ]}
    >
      <View style={[styles.emptyIconContainer, { backgroundColor: iconWash }]}>
        <Ionicons name={icon} size={48} color={uiTokens.colors.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: uiTokens.colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.emptySubtitle, { color: uiTokens.colors.textSecondary }]}>
        {subtitle}
      </Text>
    </View>
  );
}

function buildItemKey(item: ScanLookupItem, index: number) {
  const code = item?.item_code ?? "no-code";
  const barcode = item?.barcode ?? "no-barcode";
  const id = item?.id ?? item?._id ?? "no-id";
  return `${code}-${barcode}-${id}-${index}`;
}

function buildItemAccessibilityLabel(item: ScanLookupItem, prefix: string, stockQty?: number) {
  const itemName = item.item_name || "Unnamed item";
  const itemCode = item.item_code || "No item code";
  const stockLabel = stockQty === undefined ? "" : `, stock ${stockQty}`;
  return `${prefix} ${itemName}, item code ${itemCode}${stockLabel}`;
}

const RecentItemCard = React.memo(function RecentItemCard({
  item,
  onPress,
}: {
  item: ScanLookupItem;
  onPress: () => void;
}) {
  const uiTokens = useUiTokens();
  const iconWash = uiTokens.mode === "dark" ? "rgba(88, 166, 255, 0.14)" : colors.primary[50];

  return (
    <ModernCard
      elevation="none"
      padding={0}
      style={[
        styles.recentCard,
        {
          backgroundColor: uiTokens.colors.surface,
          borderColor: uiTokens.colors.border,
        },
      ]}
      onPress={onPress}
      accessibilityLabel={buildItemAccessibilityLabel(item, "Open recent item")}
      accessibilityHint="Opens item verification details"
    >
      <View style={styles.recentRow}>
        <View style={[styles.recentIcon, { backgroundColor: iconWash }]}>
          <Ionicons name="cube-outline" size={22} color={uiTokens.colors.accent} />
        </View>
        <View style={styles.recentInfo}>
          <Text
            style={[styles.recentName, { color: uiTokens.colors.textPrimary }]}
            numberOfLines={1}
          >
            {item.item_name}
          </Text>
          <Text style={[styles.recentCode, { color: uiTokens.colors.textSecondary }]}>
            {item.item_code}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={uiTokens.colors.textMuted} />
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
  const uiTokens = useUiTokens();
  const stockQty = getStockQty(item);
  const iconWash = uiTokens.mode === "dark" ? "rgba(88, 166, 255, 0.14)" : colors.primary[50];

  return (
    <TouchableOpacity
      {...getAccessibleButtonProps({
        label: buildItemAccessibilityLabel(item, "Open search result", stockQty),
        hint: "Opens item verification details",
      })}
      style={styles.resultItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.resultIcon, { backgroundColor: iconWash }]}>
        <Ionicons name="cube-outline" size={20} color={uiTokens.colors.accent} />
      </View>
      <View style={styles.resultInfo}>
        <Text style={[styles.resultName, { color: uiTokens.colors.textPrimary }]}>
          {item.item_name}
        </Text>
        <Text style={[styles.resultCode, { color: uiTokens.colors.textSecondary }]}>
          {item.item_code}
        </Text>
        <Text style={[styles.resultStock, { color: uiTokens.colors.accentStrong }]}>
          Stock: {stockQty}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={uiTokens.colors.textMuted} />
    </TouchableOpacity>
  );
});

RecentItemCard.displayName = "RecentItemCard";
SearchResultItem.displayName = "SearchResultItem";

const MAX_INLINE_SEARCH_RESULTS = 8;

const getNoticeState = (
  noticeType: ScanLookupNotice["type"],
  message: string
): ScannerFeedbackStateValue => {
  if (noticeType === "error") return "error";
  if (message.toLowerCase().includes("not found")) return "not_found";
  return noticeType === "warning" ? "warning" : "captured";
};

export function ScanLookupPanel({
  initialLoading,
  loading,
  recentItems,
  searchQuery,
  searchResults,
  notice,
  onChangeSearchQuery,
  onClearSearchQuery,
  onDismissNotice,
  onOpenScanner,
  onPressItem,
  onRetryNotice,
  onSubmitSearch,
}: ScanLookupPanelProps) {
  const uiTokens = useUiTokens();
  const surfaceStyle = {
    backgroundColor: uiTokens.colors.surface,
    borderColor: uiTokens.colors.border,
  };
  const skeletonSurface = { backgroundColor: uiTokens.colors.border };
  const trimmedSearchQuery = searchQuery.trim();
  const searchButtonLabel = trimmedSearchQuery
    ? "Submit barcode or item search"
    : "Open barcode scanner";
  const displayedSearchResults = searchResults.slice(0, MAX_INLINE_SEARCH_RESULTS);
  const hiddenSearchResultCount = Math.max(searchResults.length - displayedSearchResults.length, 0);

  return (
    <>
      <View style={styles.searchSection}>
        <View style={styles.searchRow}>
          <View style={[styles.searchInputWrapper, surfaceStyle]}>
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
            style={[
              styles.searchButton,
              {
                backgroundColor:
                  uiTokens.mode === "dark" ? colors.primary[500] : uiTokens.colors.accent,
                borderColor:
                  uiTokens.mode === "dark" ? colors.primary[600] : uiTokens.colors.accentStrong,
              },
              loading && [
                styles.searchButtonDisabled,
                {
                  backgroundColor: uiTokens.colors.border,
                  borderColor: uiTokens.colors.border,
                },
              ],
            ]}
            testID="scan-search-submit"
            onPress={trimmedSearchQuery ? onSubmitSearch : onOpenScanner}
            disabled={loading}
            activeOpacity={0.7}
            {...getAccessibleButtonProps({
              label: searchButtonLabel,
              hint: trimmedSearchQuery
                ? "Searches for the entered barcode or item code"
                : "Opens the camera scanner",
              disabled: loading,
              busy: loading,
            })}
          >
            <Ionicons
              name={trimmedSearchQuery ? "arrow-forward" : "scan"}
              size={24}
              color={colors.white}
            />
          </TouchableOpacity>
        </View>

        {notice ? (
          <ScannerFeedbackState
            compact
            state={getNoticeState(notice.type, `${notice.title} ${notice.message}`)}
            title={notice.title}
            message={notice.message}
            barcode={trimmedSearchQuery || undefined}
            retry={
              notice.actionLabel && onRetryNotice
                ? {
                    label: notice.actionLabel,
                    onPress: onRetryNotice,
                    accessibilityHint: "Retries the scan lookup action",
                  }
                : undefined
            }
            dismiss={
              onDismissNotice
                ? {
                    onPress: onDismissNotice,
                    accessibilityLabel: "Dismiss scan message",
                    accessibilityHint: "Hides this scan lookup message",
                  }
                : undefined
            }
            style={styles.notice}
            testID="scan-lookup-notice"
          />
        ) : null}

        {searchResults.length > 0 && (
          <View style={[styles.searchResultsContainer, surfaceStyle]}>
            {displayedSearchResults.map((item, index) => (
              <React.Fragment key={buildItemKey(item, index)}>
                <SearchResultItem item={item} onPress={() => onPressItem(item)} />
                {index < displayedSearchResults.length - 1 && (
                  <View
                    style={[
                      styles.searchResultSeparator,
                      { backgroundColor: uiTokens.colors.border },
                    ]}
                  />
                )}
              </React.Fragment>
            ))}
            {hiddenSearchResultCount > 0 ? (
              <View
                style={[
                  styles.searchResultsSummary,
                  { borderTopColor: uiTokens.colors.border },
                ]}
              >
                <Ionicons name="funnel-outline" size={16} color={uiTokens.colors.textMuted} />
                <Text style={[styles.searchResultsSummaryText, { color: uiTokens.colors.textSecondary }]}>
                  Showing first {displayedSearchResults.length} of {searchResults.length}. Keep
                  typing to narrow the match.
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </View>

      {searchResults.length === 0 && (
        <View style={styles.recentSection}>
          <Text style={[styles.sectionTitle, { color: uiTokens.colors.textPrimary }]}>
            Recent Items
          </Text>

          {initialLoading ? (
            <>
              {[1, 2, 3].map((value) => (
                <ModernCard
                  key={value}
                  elevation="none"
                  padding={0}
                  style={[styles.recentCard, surfaceStyle]}
                >
                  <View style={styles.recentRow}>
                    <SkeletonLoader
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        ...skeletonSurface,
                      }}
                    />
                    <View style={[styles.recentInfo, { marginLeft: spacing.md }]}>
                      <SkeletonLoader
                        style={{
                          width: "80%",
                          height: 16,
                          borderRadius: 4,
                          ...skeletonSurface,
                        }}
                      />
                      <SkeletonLoader
                        style={{
                          width: "50%",
                          height: 12,
                          marginTop: 6,
                          borderRadius: 4,
                          ...skeletonSurface,
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
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  searchButton: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[600],
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primary[700],
  },
  searchButtonDisabled: {
    backgroundColor: colors.gray[300],
    borderColor: colors.gray[300],
  },
  notice: {
    marginTop: spacing.sm,
  },
  searchResultsContainer: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
    zIndex: 200,
    elevation: 2,
  },
  searchResultSeparator: {
    height: 1,
    backgroundColor: colors.gray[100],
  },
  searchResultsSummary: {
    alignItems: "center",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchResultsSummaryText: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    lineHeight: 18,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    minHeight: 64,
  },
  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
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
    color: colors.gray[700],
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  recentCard: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
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
    borderRadius: borderRadius.md,
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
    borderRadius: borderRadius.md,
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
