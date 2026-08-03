/**
 * ScanSearchResultsList — virtualized scan-lookup results (P2 / OXS §10).
 *
 * Replaces the previous unbounded `.map()` render of search results inside a
 * ScrollView (a §10.3 prohibition). Uses Shopify FlashList with
 * `scrollEnabled={false}` so it renders inline within the parent ScrollView
 * while still recycling rows when the paginated result set grows.
 *
 * Governance §10.1: "Use virtualized lists for long item, session, variance, and
 * audit lists." §10.3: "Unbounded ScrollView for large operational lists" is
 * prohibited. Search results are paginated (`hasMore`/`onLoadMore`) and can grow,
 * so they are the operational list that must be virtualized.
 */

import React, { useCallback } from "react";
import { StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import Ionicons from "@expo/vector-icons/Ionicons";

import { getStockQty } from "@/utils/itemBatchUtils";
import { colors } from "@/theme/unified";
import { useUiTokens } from "@/hooks/useUiTokens";
import { AppTouchable } from "@/components/ui/AppTouchable";

export type ScanSearchItem = {
    _id?: string | number;
    barcode?: string;
    id?: string | number;
    item_code?: string;
    item_name?: string;
} & Record<string, any>;

const SearchResultItem = React.memo(function SearchResultItem({
    item,
    onPress,
}: {
    item: ScanSearchItem;
    onPress: () => void;
}) {
    const uiTokens = useUiTokens();
    const stockQty = getStockQty(item);
    const iconWash = uiTokens.mode === "dark" ? "rgba(88, 166, 255, 0.14)" : colors.primary[50];

    return (
        <AppTouchable
            style={styles.resultItem}
            onPress={onPress}
            activeOpacity={0.7}
            accessibilityLabel="Item">
            <View style={[styles.resultIcon, { backgroundColor: iconWash }]}>
                <Ionicons name="cube-outline" size={20} color={uiTokens.colors.accent} />
            </View>
            <View style={styles.resultInfo}>
                <Text style={[styles.resultName, { color: uiTokens.colors.textPrimary }]} numberOfLines={1}>
                    {item.item_name}
                </Text>
                <Text style={[styles.resultCode, { color: uiTokens.colors.textSecondary }]} numberOfLines={1}>
                    {item.item_code}
                </Text>
                <Text style={[styles.resultStock, { color: uiTokens.colors.accentStrong }]}>
                    Stock: {stockQty}
                </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={uiTokens.colors.textMuted} />
        </AppTouchable>
    );
});
SearchResultItem.displayName = "SearchResultItem";

export interface ScanSearchResultsListProps {
    data: ScanSearchItem[];
    onPressItem: (item: ScanSearchItem) => void;
    /** Show the "Load more" affordance (paginated results). */
    hasMore?: boolean;
    onLoadMore?: () => void;
    loading?: boolean;
}

export function ScanSearchResultsList({
    data,
    onPressItem,
    hasMore,
    onLoadMore,
    loading,
}: ScanSearchResultsListProps) {
    const uiTokens = useUiTokens();

    const renderItem: ListRenderItem<ScanSearchItem> = useCallback(
        ({ item }) => <SearchResultItem item={item} onPress={() => onPressItem(item)} />,
        [onPressItem],
    );

    const ListFooterComponent = React.useCallback(() => {
        if (!hasMore || !onLoadMore) return null;
        return (
            <View style={styles.loadMoreContainer}>
                <AppTouchable
                    style={[
                        styles.loadMoreButton,
                        {
                            borderColor: uiTokens.colors.border,
                            backgroundColor:
                                uiTokens.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                        },
                    ]}
                    onPress={onLoadMore}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel="Load more search results"
                >
                    {loading ? (
                        <ActivityIndicator size="small" color={uiTokens.colors.accent} />
                    ) : (
                        <Text style={[styles.loadMoreText, { color: uiTokens.colors.accent }]}>
                            Load More Results...
                        </Text>
                    )}
                </AppTouchable>
            </View>
        );
    }, [hasMore, onLoadMore, loading, uiTokens]);

    const ItemSeparatorComponent = React.useCallback(
        () => <View style={[styles.separator, { backgroundColor: uiTokens.colors.border }]} />,
        [uiTokens],
    );

    if (data.length === 0) return null;

    return (
        <FlashList
            data={data}
            renderItem={renderItem}
            scrollEnabled={false}
            ItemSeparatorComponent={ItemSeparatorComponent}
            ListFooterComponent={ListFooterComponent}
            keyExtractor={(item, index) => {
                const code = item?.item_code ?? "no-code";
                const barcode = item?.barcode ?? "no-barcode";
                const id = item?.id ?? item?._id ?? "no-id";
                return `${code}-${barcode}-${id}-${index}`;
            }}
        />
    );
}

const styles = StyleSheet.create({
    resultItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 12,
        gap: 12,
    },
    resultIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    resultInfo: {
        flex: 1,
        gap: 2,
    },
    resultName: {
        fontSize: 14,
        fontWeight: "600",
    },
    resultCode: {
        fontSize: 12,
    },
    resultStock: {
        fontSize: 12,
        fontWeight: "500",
        marginTop: 2,
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 12,
    },
    loadMoreContainer: {
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    loadMoreButton: {
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    loadMoreText: {
        fontSize: 13,
        fontWeight: "600",
    },
});
