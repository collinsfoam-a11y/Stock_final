import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { ModernCard } from "@/components/ui/ModernCard";
import { ModernInput } from "@/components/ui/ModernInput";
import { borderRadius, colors, spacing, typography } from "@/theme/unified";

import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";

import { AppTouchable } from "@/components/ui/AppTouchable";
import { ScanSearchResultsList } from "./ScanSearchResultsList";

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
  hasMore?: boolean;
  onLoadMore?: () => void;
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

RecentItemCard.displayName = "RecentItemCard";

const NOTICE_ICONS: Record<ScanLookupNotice["type"], keyof typeof Ionicons.glyphMap> = {
  error: "alert-circle-outline",
  info: "information-circle-outline",
  warning: "warning-outline",
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
  hasMore,
  onLoadMore,
}: ScanLookupPanelProps) {
  const uiTokens = useUiTokens();
  const surfaceStyle = {
    backgroundColor: uiTokens.colors.surface,
    borderColor: uiTokens.colors.border,
  };
  const skeletonSurface = { backgroundColor: uiTokens.colors.border };
  const noticeColor =
    notice?.type === "error"
      ? uiTokens.colors.error
      : notice?.type === "warning"
        ? uiTokens.colors.warning
        : uiTokens.colors.info;

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
          <AppTouchable
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
            onPress={searchQuery.trim() ? onSubmitSearch : onOpenScanner}
            disabled={loading}
            activeOpacity={0.7}
            accessibilityLabel={searchQuery.trim() ? "Search" : "Open scanner"}>
            <Ionicons
              name={searchQuery.trim() ? "arrow-forward" : "scan"}
              size={24}
              color={colors.white}
            />
          </AppTouchable>
        </View>

        {notice ? (
          <View
            style={[
              styles.notice,
              {
                backgroundColor: colorWithAlpha(noticeColor, 0.08),
                borderColor: colorWithAlpha(noticeColor, 0.28),
              },
            ]}
            testID="scan-lookup-notice"
          >
            <Ionicons
              name={NOTICE_ICONS[notice.type]}
              size={20}
              color={noticeColor}
              style={styles.noticeIcon}
            />
            <View style={styles.noticeBody}>
              <Text style={[styles.noticeTitle, { color: uiTokens.colors.textPrimary }]}>
                {notice.title}
              </Text>
              <Text style={[styles.noticeMessage, { color: uiTokens.colors.textSecondary }]}>
                {notice.message}
              </Text>
              {notice.actionLabel && onRetryNotice ? (
                <AppTouchable
                  style={[
                    styles.noticeAction,
                    {
                      borderColor: colorWithAlpha(noticeColor, 0.36),
                      backgroundColor: colorWithAlpha(noticeColor, 0.12),
                    },
                  ]}
                  onPress={onRetryNotice}
                  accessibilityRole="button"
                  accessibilityLabel={notice.actionLabel}
                >
                  <Text style={[styles.noticeActionText, { color: noticeColor }]}>
                    {notice.actionLabel}
                  </Text>
                </AppTouchable>
              ) : null}
            </View>
            {onDismissNotice ? (
              <AppTouchable
                style={styles.noticeDismiss}
                onPress={onDismissNotice}
                accessibilityRole="button"
                accessibilityLabel="Dismiss scan message"
              >
                <Ionicons name="close" size={18} color={uiTokens.colors.textMuted} />
              </AppTouchable>
            ) : null}
          </View>
        ) : null}

        {searchResults.length > 0 && (
          <View style={[styles.searchResultsContainer, surfaceStyle]}>
            <ScanSearchResultsList
              data={searchResults}
              onPressItem={onPressItem}
              hasMore={hasMore}
              onLoadMore={onLoadMore}
              loading={loading}
            />
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
    borderColor: colors.neutral[200],
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
    backgroundColor: colors.neutral[300],
    borderColor: colors.neutral[300],
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  noticeIcon: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  noticeBody: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.neutral[900],
  },
  noticeMessage: {
    marginTop: 2,
    fontSize: typography.fontSize.xs,
    lineHeight: 18,
    color: colors.neutral[600],
  },
  noticeAction: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: 44,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  noticeActionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  noticeDismiss: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    minHeight: 44,
    marginLeft: spacing.xs,
    marginTop: -spacing.xs,
  },
  searchResultsContainer: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    zIndex: 200,
    elevation: 2,
  },
  recentSection: {
    marginBottom: spacing.lg,
  },
  recentListContainer: {
    paddingBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.md,
    marginTop: spacing.md,
    color: colors.neutral[700],
    marginLeft: spacing.xs,
  },
  recentCard: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.neutral[200],
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
    color: colors.neutral[900],
    marginBottom: 2,
  },
  recentCode: {
    fontSize: typography.fontSize.xs,
    color: colors.neutral[500],
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.neutral[100],
    borderStyle: "dashed",
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: colors.neutral[50],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.neutral[900],
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[500],
    textAlign: "center",
    lineHeight: 20,
  },
  skeleton: {
    backgroundColor: colors.neutral[200],
    overflow: "hidden",
  },
});
