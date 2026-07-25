import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import { useSessionWebSocket } from "@/hooks/useSessionWebSocket";

import {
  checkItemCounted,
  checkItemScanStatus,
  getItemByIdentifier,
  searchItems,
  verifyItemQuantity,
} from "@/services/api/api";
import { localDb } from "@/db/localDb";
import apiClient from "@/services/httpClient";
import { RecentItemsService } from "@/services/enhancedFeatures";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";
import { toastService } from "@/services/toastService";
import { createLogger } from "@/services/logging";
import { Item } from "@/types/scan";
import { getStockQty, sortItemsByStockDesc } from "@/utils/itemBatchUtils";
import { getReadableInventoryErrorMessage } from "./errorMessages";

type MrpVariant = Record<string, any> & {
  id?: string | number;
  value?: number;
};

type ItemDetailItem = Item & {
  components?: Record<string, any>[];
  is_bundle?: boolean;
};

const isBlindRecountLine = (line: Record<string, any> | null | undefined) =>
  Boolean(
    line?.original_count_hidden || line?.blind_recount_required || line?.dual_verification_required
  );

const resolveRecountTargetId = (line: Record<string, any> | null | undefined): string | null => {
  const candidate = line?.recount_of_id || line?.id || line?.line_id || line?._id;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
};

interface UseItemDetailDataParams {
  barcode?: string;
  sessionId?: string;
  currentFloor?: string | null;
  currentRack?: string | null;
  onBackPress: () => void;
  onMrpChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
}

const isSqlUnavailableError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : "";
  const responseStatus = (error as { response?: { status?: number } })?.response?.status;
  return (
    message.includes("Not connected to database") ||
    message.includes("SQL connection") ||
    message.includes("ERP system is temporarily unavailable") ||
    responseStatus === 503
  );
};

export const useItemDetailData = ({
  barcode,
  sessionId,
  currentFloor,
  currentRack,
  onBackPress,
  onMrpChange,
  onQuantityChange,
}: UseItemDetailDataParams) => {
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const currentUsername = useAuthStore((state) => state.user?.username || "");
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState<ItemDetailItem | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mrpVariants, setMrpVariants] = useState<MrpVariant[]>([]);
  const [selectedMrpVariant, setSelectedMrpVariant] = useState<MrpVariant | null>(null);
  const [rawVariants, setRawVariants] = useState<ItemDetailItem[]>([]);
  const [showZeroStock, setShowZeroStock] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [recountTargetId, setRecountTargetId] = useState<string | null>(null);
  const [blindRecountRequired, setBlindRecountRequired] = useState(false);
  const [recountBlockedReason, setRecountBlockedReason] = useState<string | null>(null);
  const lastRefreshRequestRef = useRef<number>(0);
  const [lastErpRefresh, setLastErpRefresh] = useState<{
    checkedAt: string;
    source: string;
    scope?: string;
  } | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const refreshSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const log = createLogger("useItemDetailData");

  // WebSocket for real-time SQL verification updates
  const { isConnected, subscribe } = useSessionWebSocket(sessionId);
  const itemCodeRef = useRef<string | null>(null);

  // Keep item_code in a ref so the WS effect can compare without re-registering
  useEffect(() => {
    itemCodeRef.current = item?.item_code || null;
  }, [item?.item_code]);

  // Handle incoming SQL verification updates via WebSocket
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = subscribe("sql_verification_update", (message) => {
      const payload = (message.payload || {}) as Record<string, any>;
      const verifiedItemCode = String(payload.item_code || "");

      // Only act if this update is for the currently viewed item
      if (!verifiedItemCode || verifiedItemCode !== itemCodeRef.current) return;

      // Toast the stock change if a mismatch was detected
      if (payload.mismatch) {
        toastService.show(
          `SQL stock updated: ${payload.sql_qty} (was ${payload.mongo_qty})`,
          { type: "info" }
        );
      }

      log.debug("WebSocket sql_verification_update received", {
        ts: Date.now(),
        item_code: verifiedItemCode,
        mismatch: payload.mismatch,
        sql_qty: payload.sql_qty,
        mongo_qty: payload.mongo_qty,
      });

      // Update stock_qty directly in the item state to reflect the change immediately
      if (item && payload.sql_qty !== undefined && payload.sql_qty !== null) {
        setItem((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            stock_qty: payload.sql_qty,
          } as ItemDetailItem;
        });
      }

      setLastErpRefresh({
        checkedAt: payload.verified_at || new Date().toISOString(),
        source: "sql_server",
        scope: "item",
      });
      setRefreshStatus("success");
      if (refreshSuccessTimeoutRef.current) {
        clearTimeout(refreshSuccessTimeoutRef.current);
      }
      refreshSuccessTimeoutRef.current = setTimeout(() => {
        setRefreshStatus("idle");
        refreshSuccessTimeoutRef.current = null;
      }, 2000);
    });

    return unsubscribe;
  }, [isConnected, item, subscribe, log]);

  useEffect(() => {
    return () => {
      if (refreshSuccessTimeoutRef.current) {
        clearTimeout(refreshSuccessTimeoutRef.current);
      }
    };
  }, []);

  const applyInitialMrpState = useCallback(
    (nextItem: ItemDetailItem) => {
      const variants = Array.isArray(nextItem.mrp_variants)
        ? (nextItem.mrp_variants as MrpVariant[])
        : [];

      setMrpVariants(variants);

      if (variants.length === 0) {
        setSelectedMrpVariant(null);
        onMrpChange(String(nextItem.mrp || ""));
        return;
      }

      const matchedVariant =
        variants.find((variant) => variant.value === nextItem.mrp) || variants[0] || null;

      setSelectedMrpVariant(matchedVariant);
      onMrpChange(
        matchedVariant?.value !== undefined
          ? String(matchedVariant.value)
          : String(nextItem.mrp || "")
      );
    },
    [onMrpChange]
  );

  const sameNameVariants = useMemo(() => {
    if (!rawVariants.length || !item?.item_code) return [];

    const filtered = rawVariants.filter((variant) => {
      if (variant.item_code !== item.item_code) return false;
      if (variant.barcode === item.barcode) return false;
      if (!showZeroStock && getStockQty(variant) <= 0) return false;
      return true;
    });

    return sortItemsByStockDesc(filtered);
  }, [item, rawVariants, showZeroStock]);

  const handleSelectMrpVariant = useCallback(
    (variant: MrpVariant) => {
      setSelectedMrpVariant(variant);
      onMrpChange(String(variant.value ?? ""));
    },
    [onMrpChange]
  );

  const loadItem = useCallback(async () => {
    if (!barcode) return;

    setLoading(true);
    try {
      let itemData: ItemDetailItem | null = null;
      if (offlineMode) {
        itemData = (await localDb.getItemByBarcode(barcode)) as ItemDetailItem | null;
      } else {
        // On native only: try local SQLite cache first for instant response.
        // Skipped on web — expo-sqlite uses WebAssembly which can block
        // indefinitely on first initialisation in a mobile browser.
        if (Platform.OS !== "web") {
          try {
            const cached = await localDb.getItemByBarcode(barcode);
            if (cached?.barcode) {
              itemData = cached as ItemDetailItem;
            }
          } catch {
            // Fall through to API
          }
        }
        if (!itemData) {
          // 1 retry keeps max wait to ~31 s instead of ~93 s with 3 retries.
          // verifySql=true triggers SQL verification on item selection, fetching
          // the authoritative quantity from SQL Server and updating MongoDB.
          itemData = (await getItemByIdentifier(barcode, 1, true)) as ItemDetailItem | null;
        }
      }

      if (!itemData) {
        Alert.alert(
          "Item Not Found",
          offlineMode
            ? "This item is not available offline yet. Connect to the network and scan it again."
            : "We couldn't find an item for this barcode. Check the barcode and try again."
        );
        onBackPress();
        return;
      }

      setItem(itemData);
      applyInitialMrpState(itemData);
      setRecountTargetId(null);
      setBlindRecountRequired(false);
      setRecountBlockedReason(null);

      if (sessionId && !offlineMode) {
        try {
          const countCheck = await checkItemCounted(sessionId, itemData.item_code || barcode);
          const blindLine = (countCheck.count_lines || []).find((line: any) =>
            isBlindRecountLine(line)
          );

          if (blindLine) {
            const assignedTo =
              typeof blindLine.assigned_to === "string" ? blindLine.assigned_to.trim() : "";
            setBlindRecountRequired(true);
            setRecountTargetId(resolveRecountTargetId(blindLine));

            if (assignedTo && currentUsername && assignedTo !== currentUsername) {
              setRecountBlockedReason(`This recount is assigned to ${assignedTo}.`);
            } else {
              toastService.show("Blind recount active: previous count is hidden.", {
                type: "info",
              });
            }
          } else {
            const scanStatus = await checkItemScanStatus(sessionId, itemData.item_code || barcode);

            if (scanStatus.scanned) {
              const existing = scanStatus.locations.find(
                (location: any) =>
                  location.floor_no === currentFloor && location.rack_no === currentRack
              );

              if (existing) {
                onQuantityChange(String(existing.counted_qty));
                toastService.show("Loaded existing count", { type: "info" });
              }
            }
          }
        } catch {
          // Existing count lookup is best-effort.
        }
      }

      await RecentItemsService.addRecent(itemData.item_code || barcode, itemData);

      // Auto-trigger SQL verification when item is selected/loaded.
      // This checks if SQL quantity has changed since last cache and updates
      // MongoDB in the background. The item-detail UI shows the latest projection.
      if (!offlineMode && itemData.item_code) {
        verifyItemQuantity(itemData.item_code).catch(() => {
          // Best-effort — verification failure is non-blocking to the user flow.
        });
      }

      if (offlineMode) {
        toastService.show("Offline mode enabled: showing cached item data", {
          type: "info",
        });
      }
    } catch (error: any) {
      Alert.alert("Unable to Load Item", getReadableInventoryErrorMessage(error, "load-item"));
      onBackPress();
    } finally {
      setLoading(false);
    }
  }, [
    applyInitialMrpState,
    barcode,
    currentFloor,
    currentRack,
    currentUsername,
    offlineMode,
    onBackPress,
    onQuantityChange,
    sessionId,
  ]);

  const handleRefreshStock = useCallback(async () => {
    if (!item?.barcode && !barcode) return;
    if (offlineMode) {
      toastService.show("Offline mode is enabled", { type: "warning" });
      return;
    }

    const requestTimestamp = Date.now();
    lastRefreshRequestRef.current = requestTimestamp;

    if (refreshSuccessTimeoutRef.current) {
      clearTimeout(refreshSuccessTimeoutRef.current);
      refreshSuccessTimeoutRef.current = null;
    }
    setRefreshStatus("loading");

    try {
      const targetIdentifier = item?.item_code || item?.barcode || barcode || "";
      const response = await apiClient.get(`/api/v2/items/${targetIdentifier}?verify_sql=true`);

      if (lastRefreshRequestRef.current !== requestTimestamp) {
        return;
      }

      if (response.data.success && response.data.data) {
        const responseItem = response.data.data;
        const newItem = {
          ...responseItem,
          _source: responseItem.sql_available === false ? "cache" : "sql",
        } as ItemDetailItem;

        setItem(newItem);

        await RecentItemsService.addRecent(targetIdentifier, newItem);

        if (responseItem.sql_available === false) {
          toastService.show(
            "Unable to reach SQL Server. Displaying the last synchronized ERP quantity. Physical counting can continue.",
            { type: "warning" }
          );
        } else {
          toastService.show("Stock refreshed from SQL", { type: "success" });
        }

        const checkedAt =
          (responseItem as Record<string, any>).last_sql_verified_at ||
          (responseItem as Record<string, any>).last_sync_at ||
          new Date().toISOString();
        const source =
          (responseItem as Record<string, any>).sql_available === false
            ? "cached"
            : (responseItem as Record<string, any>).quantity_source === "sql_verification"
              ? "sql_server"
              : "cache";
        const scope = (responseItem as Record<string, any>).quantity_scope || "batch";
        setLastErpRefresh({ checkedAt, source, scope });

        setRefreshStatus("success");
        refreshSuccessTimeoutRef.current = setTimeout(() => {
          setRefreshStatus("idle");
          refreshSuccessTimeoutRef.current = null;
        }, 2000);
      } else {
        toastService.show("Failed to refresh stock", { type: "error" });
        setRefreshStatus("idle");
      }
    } catch (error) {
      if (lastRefreshRequestRef.current === requestTimestamp) {
        if (isSqlUnavailableError(error)) {
          toastService.show(
            "SQL unreachable. Last synced quantity shown. Counting continues.",
            { type: "warning" }
          );
        } else {
          toastService.show("Failed to refresh stock", { type: "error" });
        }
        setRefreshStatus("idle");
      }
    } finally {
      if (lastRefreshRequestRef.current === requestTimestamp) {
        setIsRefreshing(false);
      }
    }
  }, [item?.item_code, item?.barcode, barcode, offlineMode]);

  useEffect(() => {
    void loadItem();
  }, [loadItem]);

  useEffect(() => {
    if (!item?.item_code) {
      setRawVariants([]);
      setBatchError(null);
      return;
    }

    const loadVariants = async () => {
      setBatchLoading(true);
      setBatchError(null);

      try {
        if (offlineMode) {
          const fallbackQuery = item.item_code || item.item_name || item.name || item.barcode || "";
          const localVariants = await localDb.searchItems(fallbackQuery);
          setRawVariants(localVariants as ItemDetailItem[]);
          setBatchError("Batch data unavailable while offline mode is enabled.");
          return;
        }

        const response = await apiClient.get(
          `/api/item-batches/${encodeURIComponent(item.item_code)}`
        );
        const data = response.data || {};
        const batches = Array.isArray(data.batches) ? data.batches : [];

        const mappedBatches = batches.map((batch: any) => {
          const stockQty = getStockQty(batch);
          return {
            ...batch,
            item_code: batch.item_code ?? item.item_code,
            barcode: batch.barcode ?? batch.auto_barcode ?? "",
            stock_qty: stockQty,
            current_stock: stockQty,
            mrp: batch.mrp ?? null,
            manufacturing_date: batch.manufacturing_date ?? batch.mfg_date ?? null,
          };
        });

        setRawVariants(mappedBatches);
      } catch (error) {
        console.warn("Failed to load batches:", error);
        try {
          const results = offlineMode
            ? { items: await localDb.searchItems(item.item_code) }
            : await searchItems(item.item_code);
          setRawVariants((results.items || []) as ItemDetailItem[]);
        } catch (fallbackError) {
          console.warn("Batch fallback search failed:", fallbackError);
          setRawVariants([]);
        }
        setBatchError(
          offlineMode
            ? "Batch data unavailable while offline mode is enabled."
            : "Batch data unavailable while ERP is offline."
        );
      } finally {
        setBatchLoading(false);
      }
    };

    void loadVariants();
  }, [item, offlineMode]);

  return {
    batchError,
    batchLoading,
    handleRefreshStock,
    handleSelectMrpVariant,
    isRefreshing,
    item,
    lastErpRefresh,
    loading,
    mrpVariants,
    rawVariantsCount: rawVariants.length,
    refreshStatus,
    recountBlockedReason,
    recountTargetId,
    sameNameVariants,
    selectedMrpVariant,
    setShowZeroStock,
    showZeroStock,
    blindRecountRequired,
  };
};