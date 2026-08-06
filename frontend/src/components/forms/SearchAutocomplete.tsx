/**
 * Search Autocomplete Component
 * Enhanced search with dropdown suggestions after 4 characters
 */

import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, StyleSheet, FlatList, ActivityIndicator, Keyboard } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../../hooks/useTheme";
import { useSettingsStore } from "../../store/settingsStore";
import { searchItems, SearchResult } from "../../services/enhancedSearchService";
import { useStableDebouncedCallback } from "../../hooks/useDebouncedCallback";
import { localDb } from "../../db/localDb";

import { shadows as uiShadows } from "@/theme/unified";
import { zIndex as uiZIndex } from "@/theme/designTokens";
import { AppTouchable } from "@/components/ui/AppTouchable";
import { haptics } from "@/services/haptics";
import { getAccessibleButtonProps, getDecorativeIconProps } from "@/utils/accessibility";
interface SearchAutocompleteProps {
  onSelectItem: (item: SearchResult) => void;
  onBarcodeScan?: (barcode: string) => void;
  placeholder?: string;
  minChars?: number;
  showIcon?: boolean;
  autoFocus?: boolean;
}

export const SearchAutocomplete: React.FC<SearchAutocompleteProps> = ({
  onSelectItem,
  onBarcodeScan,
  placeholder = "Search by name, code, or barcode (min 4 chars)",
  minChars = 4,
  showIcon = true,
  autoFocus = false,
}) => {
  const theme = useTheme();
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const debounceDelay = useSettingsStore((state) => state.settings.debounceDelay);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList>(null);

  // Search function
  const performSearch = React.useCallback(
    async (searchQuery: string) => {
      if (!searchQuery || searchQuery.trim().length < minChars) {
        setResults([]);
        setPage(1);
        setHasMore(false);
        setShowDropdown(false);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setShowDropdown(true);

      try {
        if (offlineMode) {
          const offlineItems = await localDb.searchItems(searchQuery);
          setResults(
            offlineItems.map((item): SearchResult => ({
              id: String(item.id || item.item_code || item.barcode || ""),
              item_code: String(item.item_code || item.barcode || ""),
              name: String(item.item_name || item.name || ""),
              item_name: typeof item.item_name === "string" ? item.item_name : item.name,
              barcode: typeof item.barcode === "string" ? item.barcode : undefined,
              category: typeof item.category === "string" ? item.category : undefined,
              stock_qty: typeof item.stock_qty === "number" ? item.stock_qty : 0,
              mrp: typeof item.mrp === "number" ? item.mrp : undefined,
              matchType: "partial",
            }))
          );
          setPage(1);
          setHasMore(false);
        } else {
          const response = await searchItems({ query: searchQuery }, 1, 20);
          setResults(response.items || []);
          setPage(response.page || 1);
          setHasMore((response.page || 1) < (response.totalPages || 1));
        }
        setSelectedIndex(-1);
      } catch (error) {
        __DEV__ && console.error("Search error:", error);
        setResults([]);
        setHasMore(false);
      } finally {
        setIsSearching(false);
      }
    },
    [minChars, offlineMode]
  );

  const loadMore = React.useCallback(async () => {
    if (isLoadingMore || !hasMore || offlineMode) return;
    
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const response = await searchItems({ query }, nextPage, 20);
      setResults(prev => [...prev, ...(response.items || [])]);
      setPage(response.page || nextPage);
      setHasMore((response.page || nextPage) < (response.totalPages || 1));
    } catch (error) {
      __DEV__ && console.error("Load more error:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, offlineMode, query, page]);

  // Debounced search using stable hook
  const debouncedSearch = useStableDebouncedCallback(performSearch, debounceDelay);

  useEffect(() => {
    debouncedSearch(query);
  }, [query, debouncedSearch]);

  const handleQueryChange = (text: string) => {
    setQuery(text);

    // If it's a numeric barcode (6+ digits), trigger barcode scan
    if (/^\d{6,}$/.test(text.trim()) && onBarcodeScan) {
      onBarcodeScan(text.trim());
      setQuery("");
      setResults([]);
      setShowDropdown(false);
      return;
    }

    // Show dropdown if query length >= minChars
    if (text.trim().length >= minChars) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
      setResults([]);
    }
  };

  const handleSelectItem = (item: SearchResult) => {
    void haptics.light();
    onSelectItem(item);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
    Keyboard.dismiss();
  };

  const handleClear = () => {
    void haptics.light();
    setQuery("");
    setResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const renderResultItem = ({ item, index }: { item: SearchResult; index: number }) => {
    const isSelected = index === selectedIndex;
    const matchType = item.matchType;

    return (
      <AppTouchable
        style={[
          styles.resultItem,
          {
            backgroundColor: isSelected
              ? theme.colors.primary + "15" // Subtle highlight
              : theme.colors.surface,
            borderColor: isSelected ? theme.colors.primary : "transparent",
          },
        ]}
        onPress={() => handleSelectItem(item)}
        activeOpacity={0.7}
 >
        <View style={styles.resultContent}>
          {/* Header: Name and Badge */}
          <View style={styles.resultHeader}>
            <Text style={[styles.resultName, { color: theme.colors.text }]} numberOfLines={1}>
              {item.item_name}
            </Text>
            {matchType === "exact" && (
              <View
                style={[
                  styles.matchBadge,
                  {
                    backgroundColor: theme.colors.success + "20",
                    borderColor: theme.colors.success,
                  },
                ]}
              >
                <Text style={[styles.matchBadgeText, { color: theme.colors.success }]}>Exact</Text>
              </View>
            )}
            {matchType === "partial" && (
              <View
                style={[
                  styles.matchBadge,
                  {
                    backgroundColor: theme.colors.info + "20",
                    borderColor: theme.colors.info,
                  },
                ]}
              >
                <Text style={[styles.matchBadgeText, { color: theme.colors.info }]}>Match</Text>
              </View>
            )}
          </View>

          {/* Primary Details: Location and Stock */}
          <View style={styles.primaryDetailsRow}>
            {item.floor || item.rack ? (
              <View style={styles.detailChip}>
                <Ionicons name="location-sharp" size={14} color={theme.colors.primary} />
                <Text style={[styles.detailText, { color: theme.colors.text }]}>
                  {[item.floor, item.rack].filter(Boolean).join(" / ")}
                </Text>
              </View>
            ) : (
              <View style={[styles.detailChip, { opacity: 0.5 }]}>
                <Ionicons name="location-outline" size={14} color={theme.colors.textSecondary} />
                <Text style={[styles.detailText, { color: theme.colors.textSecondary }]}>
                  No Loc
                </Text>
              </View>
            )}

            <View style={styles.detailChip}>
              <Ionicons name="cube-outline" size={14} color={theme.colors.secondary} />
              <Text style={[styles.detailText, { color: theme.colors.text }]}>
                Qty: {item.stock_qty}
              </Text>
            </View>

            {(item.mrp ?? 0) > 0 && (
              <View style={styles.detailChip}>
                <Ionicons name="pricetag-outline" size={14} color={theme.colors.success} />
                <Text style={[styles.detailText, { color: theme.colors.text }]}>₹{item.mrp}</Text>
              </View>
            )}
          </View>

          {/* Secondary Details: Code, Barcode, Category */}
          <View style={styles.secondaryDetailsRow}>
            <Text style={[styles.metaText, { color: theme.colors.textSecondary }]}>
              Code: {item.item_code}
            </Text>
            {item.barcode && (
              <>
                <Text style={[styles.metaDivider, { color: theme.colors.border }]}>|</Text>
                <View style={styles.metaWithIcon}>
                  <Ionicons name="barcode-outline" size={12} color={theme.colors.textSecondary} />
                  <Text style={[styles.metaText, { color: theme.colors.textSecondary }]}>
                    {item.barcode}
                  </Text>
                </View>
              </>
            )}
            {item.category && (
              <>
                <Text style={[styles.metaDivider, { color: theme.colors.border }]}>|</Text>
                <Text
                  style={[styles.metaText, { color: theme.colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {item.category}
                </Text>
              </>
            )}
          </View>
        </View>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={theme.colors.placeholder}
          style={{ opacity: 0.5 }}
        />
      </AppTouchable>
    );
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.colors.surface,
            borderColor: showDropdown ? theme.colors.primary : theme.colors.border,
            ...uiShadows.md,
          },
        ]}
      >
        {showIcon && (
          <Ionicons
            name="search"
            size={20}
            color={showDropdown ? theme.colors.primary : theme.colors.placeholder}
            style={styles.searchIcon}
          />
        )}

        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.colors.text }]}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.placeholder}
          value={query}
          onChangeText={handleQueryChange}
          autoFocus={autoFocus}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />

        {isSearching && (
          <ActivityIndicator size="small" color={theme.colors.primary} style={styles.loadingIcon} />
        )}

        {query.length > 0 && !isSearching && (
          <AppTouchable
            style={styles.clearButton}
            onPress={handleClear}
            activeOpacity={0.7}
            {...getAccessibleButtonProps({ label: "Clear search" })}>
            <Ionicons name="close-circle" size={20} color={theme.colors.placeholder} {...getDecorativeIconProps()} />
          </AppTouchable>
        )}
      </View>
      {showDropdown && (
        <View
          style={[
            styles.dropdown,
            {
              backgroundColor: theme.colors.surface, // Match surface for seamless look
              borderColor: theme.colors.border,
              ...uiShadows.md,
            },
          ]}
        >
          {isSearching ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
                Searching...
              </Text>
            </View>
          ) : results.length > 0 ? (
            <>
              <View style={styles.resultsHeader}>
                <Text style={[styles.resultsHeaderText, { color: theme.colors.textSecondary }]}>
                  FOUND {results.length} {results.length === 1 ? "ITEM" : "ITEMS"}
                </Text>
              </View>
              <FlatList
                ref={listRef}
                data={results}
                renderItem={renderResultItem}
                keyExtractor={(item, index) => `${item.item_code}-${index}`}
                style={styles.resultsList}
                keyboardShouldPersistTaps="handled"
                maxToRenderPerBatch={10}
                windowSize={5}
                showsVerticalScrollIndicator={true}
                ListFooterComponent={
                  hasMore ? (
                    <AppTouchable
                      style={styles.loadMoreButton}
                      onPress={loadMore}
                      disabled={isLoadingMore}
                    >
                      {isLoadingMore ? (
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                      ) : (
                        <Text style={[styles.loadMoreText, { color: theme.colors.primary }]}>
                          Load More Results...
                        </Text>
                      )}
                    </AppTouchable>
                  ) : null
                }
              />
            </>
          ) : query.trim().length >= minChars ? (
            <View style={styles.noResultsContainer}>
              <View
                style={[styles.noResultsIconCircle, { backgroundColor: theme.colors.background }]}
              >
                <Ionicons name="search-outline" size={32} color={theme.colors.placeholder} />
              </View>
              <Text style={[styles.noResultsText, { color: theme.colors.text }]}>
                No items found
              </Text>
              <Text style={[styles.noResultsHint, { color: theme.colors.textSecondary }]}>
                Try searching by a different code or name
              </Text>
            </View>
          ) : (
            <View style={styles.minCharsContainer}>
              <Text style={[styles.minCharsText, { color: theme.colors.textSecondary }]}>
                Type {minChars}+ characters...
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
    zIndex: uiZIndex.toast,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12, // More rounded
    paddingHorizontal: 14,
    height: 50, // Taller input
    ...uiShadows.md,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
    fontWeight: "500",
  },
  loadingIcon: {
    marginLeft: 8,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  dropdown: {
    position: "absolute", // Ensure it floats over content
    top: 56, // Just below input
    left: 0,
    right: 0,
    borderRadius: 12,
    borderWidth: 1,
    maxHeight: 450,
    elevation: 10,
    ...uiShadows.md,
    overflow: "hidden", // Clip content to border radius
  },
  loadingContainer: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "500",
  },
  resultsHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  resultsHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  resultsList: {
    maxHeight: 400,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    borderLeftWidth: 3, // Accent border on selection
  },
  resultContent: {
    flex: 1,
    gap: 6,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 8,
  },
  resultName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  matchBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    marginLeft: 8,
  },
  matchBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  primaryDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  detailChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  detailText: {
    fontSize: 13,
    fontWeight: "600",
  },
  secondaryDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  metaWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "500",
  },
  metaDivider: {
    fontSize: 10,
    marginHorizontal: 2,
    opacity: 0.5,
  },
  noResultsContainer: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  noResultsIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  noResultsText: {
    fontSize: 16,
    fontWeight: "600",
  },
  noResultsHint: {
    fontSize: 14,
    textAlign: "center",
  },
  minCharsContainer: {
    padding: 24,
    alignItems: "center",
  },
  minCharsText: {
    fontSize: 14,
    fontStyle: "italic",
  },
  loadMoreButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
