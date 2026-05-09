/**
 * ItemSearch Component
 * Search autocomplete for finding items by name or barcode
 * Enhanced with pagination and infinite scroll
 */
import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SearchResult } from "../../services/enhancedSearchService";
import { Skeleton } from "../ui/Skeleton";
import { BatchDetailsModal } from "./BatchDetailsModal";
import { VirtualList } from "../common/VirtualList";

import { semanticColors, colors } from "@/theme/legacyCompat";
import { colorWithAlpha } from "@/theme/themeTokens";
interface ItemSearchProps {
  manualBarcode: string;
  manualItemName: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  isListening?: boolean;
  showSearchResults: boolean;
  onBarcodeChange: (barcode: string) => void;
  onItemNameChange: (name: string) => void;
  onBarcodeSubmit: () => void;
  onItemNameSubmit: () => void;
  onSearch: (query: string) => void;
  onVoiceSearch?: () => void;
  onScan?: () => void;
  onClearSearch?: () => void;
  onSearchResultSelect: (item: SearchResult) => void;
  onActivityReset?: () => void;
  onBulkEntry?: () => void;
  // Pagination props
  totalResults?: number;
  currentPage?: number;
  hasNextPage?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export const ItemSearch: React.FC<ItemSearchProps> = ({
  manualBarcode,
  manualItemName,
  searchResults,
  isSearching,
  isListening = false,
  showSearchResults,
  onBarcodeChange,
  onItemNameChange,
  onBarcodeSubmit,
  onItemNameSubmit,
  onSearch,
  onVoiceSearch,
  onScan,
  onSearchResultSelect,
  onActivityReset,
  onBulkEntry,
  // Pagination props with defaults
  totalResults = 0,
  currentPage: _currentPage = 1,
  hasNextPage = false,
  isLoadingMore = false,
  onLoadMore,
}) => {
  const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  // Handle item selection - show batch details modal
  const handleItemSelect = useCallback((item: SearchResult) => {
    setSelectedItem(item);
    setShowBatchModal(true);
  }, []);

  // Handle batch selection from modal
  const handleBatchSelect = (batch: any, countedStock: number) => {
    // If no batch is selected (user closed modal without selecting), just close modal
    if (!batch) {
      setShowBatchModal(false);
      setSelectedItem(null);
      return;
    }

    // Create a combined item object with batch information
    const itemWithBatch = {
      ...selectedItem,
      selectedBatch: batch,
      countedStock: countedStock,
    };

    // Call the original handler with batch information
    onSearchResultSelect(itemWithBatch as SearchResult);

    // Close modal
    setShowBatchModal(false);
    setSelectedItem(null);
  };

  // Render individual search result item
  const renderSearchResultItem = useCallback(
    ({ item, index }: { item: SearchResult; index: number }) => (
      <TouchableOpacity
        key={`search-result-${index}-${item.item_code || "no-code"}-${item.barcode || "no-barcode"}`}
        style={styles.searchResultItem}
        onPress={() => handleItemSelect(item)}
      >
        <View style={styles.searchResultContent}>
          <View style={styles.resultHeader}>
            <Text style={styles.searchResultName}>{item.item_name}</Text>
            {item.relevance_score !== undefined && item.relevance_score >= 500 && (
              <View style={styles.exactMatchBadge}>
                <Text style={styles.exactMatchText}>Exact</Text>
              </View>
            )}
          </View>
          <Text style={styles.searchResultCode}>Code: {item.item_code}</Text>
          {item.barcode && <Text style={styles.searchResultBarcode}>Barcode: {item.barcode}</Text>}
          <Text style={styles.searchResultStock}>Stock: {item.stock_qty || 0}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={semanticColors.text.tertiary} />
      </TouchableOpacity>
    ),
    [handleItemSelect]
  );

  // Footer component for infinite scroll
  const renderFooter = useCallback(() => {
    if (!hasNextPage) return null;

    if (isLoadingMore) {
      return (
        <View style={styles.loadingMoreContainer}>
          <ActivityIndicator size="small" color={colors.primary[500]} />
          <Text style={styles.loadingMoreText}>Loading more...</Text>
        </View>
      );
    }

    return (
      <TouchableOpacity style={styles.loadMoreButton} onPress={onLoadMore}>
        <Text style={styles.loadMoreText}>Load More Results</Text>
        <Ionicons name="chevron-down" size={16} color={colors.primary[500]} />
      </TouchableOpacity>
    );
  }, [hasNextPage, isLoadingMore, onLoadMore]);

  // Handle end reached for infinite scroll
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isLoadingMore && onLoadMore) {
      onLoadMore();
    }
  }, [hasNextPage, isLoadingMore, onLoadMore]);

  const itemNameSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <View style={styles.manualEntryContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.manualEntryTitle}>Scan or Search Item</Text>
        {onBulkEntry && (
          <TouchableOpacity onPress={onBulkEntry} style={styles.bulkButton}>
            <Ionicons name="list-outline" size={20} color={colors.primary[500]} />
            <Text style={styles.bulkButtonText}>Bulk Entry</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Barcode Input */}
      <View style={styles.inputGroup}>
        <View style={styles.inputLabelContainer}>
          <Ionicons name="barcode-outline" size={20} color={colors.primary[500]} />
          <Text style={styles.inputLabel}>Scan Barcode</Text>
        </View>
        <View style={styles.combinedInputContainer}>
          <TextInput
            style={styles.manualInput}
            placeholder="Enter barcode"
            placeholderTextColor={semanticColors.text.tertiary}
            value={manualBarcode}
            onChangeText={(text) => {
              onActivityReset?.();
              onBarcodeChange(text);
            }}
            keyboardType="numeric"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={onBarcodeSubmit}
          />
          {onScan && (
            <TouchableOpacity style={styles.scanButton} onPress={onScan}>
              <Ionicons name="scan-outline" size={20} color={semanticColors.text.inverse} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.searchButton, !manualBarcode && styles.searchButtonDisabled]}
            onPress={() => {
              onActivityReset?.();
              onBarcodeSubmit();
            }}
            disabled={!manualBarcode}
          >
            <Ionicons name="arrow-forward" size={20} color={semanticColors.text.inverse} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Item Name Search Input */}
      <View style={styles.inputGroup}>
        <View style={styles.inputLabelContainer}>
          <Ionicons name="search-outline" size={20} color={colors.primary[500]} />
          <Text style={styles.inputLabel}>Search Item Name</Text>
          {onVoiceSearch && (
            <TouchableOpacity style={styles.voiceButton} onPress={onVoiceSearch}>
              <Ionicons
                name={isListening ? "mic" : "mic-outline"}
                size={20}
                color={isListening ? colors.error[500] : colors.primary[500]}
              />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.combinedInputContainer}>
          <TextInput
            style={styles.manualInput}
            placeholder="Enter item name"
            placeholderTextColor={semanticColors.text.tertiary}
            value={manualItemName}
            onChangeText={(text) => {
              onActivityReset?.();
              onItemNameChange(text);

              if (itemNameSearchTimeoutRef.current) {
                clearTimeout(itemNameSearchTimeoutRef.current);
                itemNameSearchTimeoutRef.current = null;
              }

              const trimmed = text.trim();
              if (trimmed.length >= 3) {
                itemNameSearchTimeoutRef.current = setTimeout(() => {
                  onSearch(text);
                }, 350);
              } else {
                onSearch("");
              }
            }}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={onItemNameSubmit}
          />
          <TouchableOpacity
            style={[styles.searchButton, !manualItemName && styles.searchButtonDisabled]}
            onPress={() => {
              onActivityReset?.();
              onItemNameSubmit();
            }}
            disabled={!manualItemName}
          >
            <Ionicons name="search" size={20} color={semanticColors.text.inverse} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Results with Infinite Scroll */}
      {showSearchResults && searchResults.length > 0 && (
        <View style={styles.searchResultsContainer}>
          <View style={styles.searchResultsHeader}>
            <Text style={styles.searchResultsTitle}>Search Results</Text>
            <Text style={styles.searchResultsCount}>
              {searchResults.length}
              {totalResults > searchResults.length ? ` of ${totalResults}` : ""}
            </Text>
          </View>
          {/* ⚡ Bolt: Replaced FlatList with VirtualList (FlashList) to improve scrolling performance, handle potentially long paginated search results without lag, and reduce frame drops. */}
          <VirtualList
            data={searchResults}
            renderItem={renderSearchResultItem}
            estimatedItemSize={96}
            keyExtractor={(item, index) =>
              `search-${index}-${item.item_code || "no-code"}-${item.barcode || "no-barcode"}`
            }
            style={styles.searchResultsFlatList}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={true}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.3}
            ListFooterComponent={renderFooter}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
          />
        </View>
      )}

      {isSearching && (
        <View style={styles.searchingContainer}>
          <Skeleton width="100%" height={60} style={{ marginBottom: 8 }} />
          <Skeleton width="100%" height={60} style={{ marginBottom: 8 }} />
          <Skeleton width="100%" height={60} />
        </View>
      )}

      {/* Batch Details Modal */}
      <BatchDetailsModal
        visible={showBatchModal}
        item={selectedItem}
        onClose={() => {
          setShowBatchModal(false);
          setSelectedItem(null);
        }}
        onBatchSelect={handleBatchSelect}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  manualEntryContainer: {
    marginTop: 16,
  },
  manualEntryTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: semanticColors.text.inverse,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  bulkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colorWithAlpha(colors.primary[500], 0.1),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colorWithAlpha(colors.primary[500], 0.3),
  },
  bulkButtonText: {
    color: colors.primary[500],
    fontSize: 14,
    fontWeight: "600",
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: semanticColors.text.tertiary,
    flex: 1,
  },
  voiceButton: {
    backgroundColor: colors.primary[500],
    borderRadius: 12,
    padding: 8,
    alignItems: "center",
  },
  combinedInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.neutral[800],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.neutral[700],
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  manualInput: {
    flex: 1,
    color: semanticColors.text.inverse,
    fontSize: 16,
    paddingVertical: 12,
    paddingRight: 8,
  },
  scanButton: {
    padding: 8,
    backgroundColor: colorWithAlpha(colors.primary[500], 0.1),
    borderRadius: 8,
    marginLeft: 4,
  },
  searchButton: {
    padding: 8,
    backgroundColor: colors.primary[500],
    borderRadius: 8,
    marginLeft: 8,
  },
  searchButtonDisabled: {
    opacity: 0.5,
    backgroundColor: colors.neutral[700],
  },
  searchButtonText: {
    color: semanticColors.text.inverse,
    fontSize: 16,
    fontWeight: "600",
  },
  inputDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.neutral[700],
  },
  orText: {
    marginHorizontal: 16,
    color: semanticColors.text.tertiary,
    fontSize: 14,
  },
  searchResultsContainer: {
    backgroundColor: colors.neutral[800],
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    maxHeight: 350,
  },
  searchResultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  searchResultsTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: semanticColors.text.inverse,
  },
  searchResultsCount: {
    fontSize: 14,
    color: semanticColors.text.tertiary,
  },
  searchResultsFlatList: {
    maxHeight: 280,
  },
  searchResultsScrollView: {
    maxHeight: 250,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  exactMatchBadge: {
    backgroundColor: colorWithAlpha(colors.success[500], 0.2),
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colorWithAlpha(colors.success[500], 0.4),
  },
  exactMatchText: {
    color: colors.success[500],
    fontSize: 10,
    fontWeight: "600",
  },
  loadingMoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  loadingMoreText: {
    color: semanticColors.text.tertiary,
    fontSize: 14,
  },
  loadMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    backgroundColor: colorWithAlpha(colors.primary[500], 0.1),
    borderRadius: 8,
    marginTop: 8,
  },
  loadMoreText: {
    color: colors.primary[500],
    fontSize: 14,
    fontWeight: "600",
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.neutral[800],
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  searchResultContent: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: "600",
    color: semanticColors.text.inverse,
    marginBottom: 4,
  },
  searchResultCode: {
    fontSize: 12,
    color: semanticColors.text.tertiary,
    marginBottom: 2,
  },
  searchResultBarcode: {
    fontSize: 12,
    color: semanticColors.text.tertiary,
    marginBottom: 2,
    fontFamily: "monospace",
  },
  searchResultStock: {
    fontSize: 12,
    color: colors.primary[500],
    marginTop: 4,
  },
  searchingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 16,
  },
  searchingText: {
    color: semanticColors.text.tertiary,
    fontSize: 14,
  },
});
