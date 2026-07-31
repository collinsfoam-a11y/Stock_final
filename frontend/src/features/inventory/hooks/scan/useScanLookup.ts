import { useState, useCallback, useRef, useEffect } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useDebounce } from "use-debounce";

import { useSafeAsync } from "../../../../hooks/useSafeAsync";
import { localDb } from "../../../../db/localDb";
import {
  getItemByBarcode,
  searchItemsOptimized,
  checkItemScanStatus,
} from "../../../../services/api/api";
import { searchItemsSemantic } from "../../../../services/api/inventoryWorkflowApi";
import { RecentItemsService } from "../../../../services/enhancedFeatures";
import { playScanSound } from "../../../../services/scanSoundService";
import { toastService } from "../../../../services/toastService";
import { validateBarcode } from "../../../../utils/validation";
import { dedupeItemsKeepingHighestStock } from "../../../../utils/itemBatchUtils";
import { ScanLookupNotice } from "../../../../components/scan/ScanLookupPanel";

interface UseScanLookupProps {
  sessionId: string | undefined;
  offlineMode: boolean;
  scannerSound: boolean;
  debounceDelay: number;
  currentFloor: string | null;
  currentRack: string | null;
}

export function useScanLookup({
  sessionId,
  offlineMode,
  scannerSound,
  debounceDelay,
  currentFloor,
  currentRack,
}: UseScanLookupProps) {
  const router = useRouter();
  const { safeSetState, safeAsync } = useSafeAsync();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebounce(searchQuery, debounceDelay);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [recentItems, setRecentItems] = useState<any[]>([]);
  const [lookupNotice, setLookupNotice] = useState<ScanLookupNotice | null>(null);
  const [lastLookupBarcode, setLastLookupBarcode] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searchPage, setSearchPage] = useState(1);
  const [hasMoreSearchResults, setHasMoreSearchResults] = useState(false);

  // Guard for item selection
  const selectInFlightRef = useRef(false);

  const loadRecentItems = useCallback(async () => {
    try {
      const items = await safeAsync(() => RecentItemsService.getRecentItems());
      if (items) {
        safeSetState(setRecentItems, items);
      }
    } catch (error) {
      console.error("Failed to load recent items", error);
    }
  }, [safeAsync, safeSetState]);

  const performSearch = useCallback(
    async (query: string, page = 1, append = false) => {
      try {
        if (offlineMode) {
          const localResults = (await safeAsync(() => localDb.searchItems(query))) as any;
          if (localResults) {
            safeSetState(setSearchResults, dedupeItemsKeepingHighestStock(localResults));
            safeSetState(setHasMoreSearchResults, false);
          }
          return;
        }

        const fetchTasks: Array<Promise<any>> = [safeAsync(() => searchItemsOptimized(query, page, 20))];
        if (page === 1) {
          fetchTasks.push(safeAsync(() => searchItemsSemantic(query, 10)));
        }

        const [fuzzyResult, semanticResult] = await Promise.all(fetchTasks);

        let items: any[] = [];
        if (fuzzyResult) {
          items = Array.isArray((fuzzyResult as any).items) ? (fuzzyResult as any).items : [];
          safeSetState(setHasMoreSearchResults, Boolean((fuzzyResult as any).hasMore));
        }

        if (page === 1 && semanticResult) {
          items = [...(semanticResult as any[]), ...items];
        }

        safeSetState(
          setSearchResults,
          (prev: any[]) => {
            const combined = append ? [...prev, ...items] : items;
            return dedupeItemsKeepingHighestStock(combined);
          }
        );
      } catch (error) {
        console.error("Search failed", error);
      }
    },
    [offlineMode, safeAsync, safeSetState]
  );

  const loadMoreSearchResults = useCallback(() => {
    if (!hasMoreSearchResults || loading || !debouncedSearchQuery.trim()) return;
    const nextPage = searchPage + 1;
    safeSetState(setSearchPage, nextPage);
    performSearch(debouncedSearchQuery, nextPage, true);
  }, [hasMoreSearchResults, loading, debouncedSearchQuery, searchPage, performSearch, safeSetState]);

  useEffect(() => {
    if (debouncedSearchQuery.trim().length > 2) {
      safeSetState(setSearchPage, 1);
      performSearch(debouncedSearchQuery, 1, false);
    } else {
      safeSetState(setSearchResults, []);
      safeSetState(setHasMoreSearchResults, false);
    }
  }, [debouncedSearchQuery, performSearch, safeSetState]);

  const navigateToDetail = (barcode: string) => {
    safeSetState(setSearchQuery, "");
    if (sessionId) {
      router.push({
        pathname: "/staff/item-detail",
        params: { barcode, sessionId },
      } as any);
    }
  };

  const handleLookup = async (barcode: string, onLookupEnd?: () => void) => {
    if (loading) return;
    const lookupValue = barcode.trim();
    safeSetState(setLastLookupBarcode, lookupValue);
    safeSetState(setLookupNotice, null);
    
    const validation = validateBarcode(lookupValue);
    if (!validation.valid) {
      void playScanSound("error", scannerSound);
      safeSetState(setLookupNotice, {
        message: `${validation.error || "The barcode format is not valid."} Check the label, edit the code, or scan again before continuing.`,
        title: "Barcode not accepted",
        type: "warning",
      });
      if (onLookupEnd) onLookupEnd();
      return;
    }

    safeSetState(setLoading, true);
    try {
      let item: any;

      try {
        item = await safeAsync(() => localDb.getItemByBarcode(validation.value!));
      } catch {
        // Fall through
      }

      if (!item && !offlineMode) {
        try {
          item = await safeAsync(() => getItemByBarcode(validation.value!));
        } catch (e) {
          throw e;
        }
      }

      if (item) {
        await safeAsync(() => RecentItemsService.addRecent(item.item_code, item));
        await loadRecentItems();

        if (!offlineMode && sessionId) {
          try {
            const scanStatus = await safeAsync(() =>
              checkItemScanStatus(sessionId, item.item_code)
            ) as any;
            if (scanStatus?.scanned) {
              const locations = scanStatus.locations || [];
              const duplicateInLocation = locations.find(
                (loc: any) => loc.floor_no === currentFloor && loc.rack_no === currentRack
              );

              if (duplicateInLocation) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                void playScanSound("warning", scannerSound);
                safeSetState(setLoading, false);
                if (onLookupEnd) onLookupEnd();
                Alert.alert(
                  "Duplicate Scan",
                  `Item already counted here by ${duplicateInLocation.counted_by}.\nQty: ${duplicateInLocation.counted_qty}`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Verify / Update",
                      onPress: () => navigateToDetail(item.barcode || validation.value!),
                    },
                  ]
                );
                return;
              } else {
                toastService.show(`Item found in ${locations.length} other location(s)`, {
                  type: "info",
                });
              }
            }
          } catch {
            // Ignore
          }
        }

        safeSetState(setLookupNotice, null);
        navigateToDetail(item.barcode || validation.value!);
      } else {
        void playScanSound("warning", scannerSound);
        safeSetState(setLookupNotice, {
          actionLabel: offlineMode ? undefined : "Retry lookup",
          message: offlineMode
            ? `Code ${validation.value} is not stored on this device. Reconnect or sync before continuing, or verify the label with a supervisor.`
            : `No item matched ${validation.value}. Check the label, rescan, or retry the lookup before entering a count.`,
          title: offlineMode ? "Item not in offline cache" : "Item not found",
          type: "warning",
        });
      }
    } catch (error: any) {
      void playScanSound("error", scannerSound);
      const reason = error?.message || "The lookup request did not finish.";
      safeSetState(setLookupNotice, {
        actionLabel: "Retry lookup",
        message: `${reason} Your scan was not submitted. Retry lookup or rescan the item.`,
        title: "Lookup failed",
        type: "error",
      });
    } finally {
      safeSetState(setLoading, false);
      if (onLookupEnd) onLookupEnd();
    }
  };

  const getLookupItemIdentifier = (item: any): string | null => {
    const candidates = [
      item?.barcode,
      item?.manual_barcode,
      item?.unit2_barcode,
      item?.unit_m_barcode,
      item?.item_code,
      item?.id,
      item?._id,
    ];
    for (const candidate of candidates) {
      const value = String(candidate ?? "").trim();
      if (value) return value;
    }
    return null;
  };

  const handleSelectLookupItem = async (item: any) => {
    if (loading || selectInFlightRef.current) return;

    const identifier = getLookupItemIdentifier(item);
    if (!identifier) {
      safeSetState(setLookupNotice, {
        message: "This search result is missing an item code or barcode. Try searching again.",
        title: "Item cannot be opened",
        type: "warning",
      });
      return;
    }

    selectInFlightRef.current = true;
    safeSetState(setLoading, true);
    safeSetState(setLookupNotice, null);
    safeSetState(setSearchResults, []);
    safeSetState(setSearchQuery, "");

    try {
      if (item?.item_code) {
        await safeAsync(() => RecentItemsService.addRecent(item.item_code, item));
        await loadRecentItems();
      }
      navigateToDetail(identifier);
    } catch {
      selectInFlightRef.current = false;
      safeSetState(setLoading, false);
    }
  };

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    recentItems,
    lookupNotice,
    setLookupNotice,
    lastLookupBarcode,
    loading,
    setLoading,
    initialLoading,
    setInitialLoading,
    selectInFlightRef,
    loadRecentItems,
    handleLookup,
    handleSelectLookupItem,
    hasMoreSearchResults,
    loadMoreSearchResults,
  };
}
