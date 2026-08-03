import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform } from "react-native";

import {
  checkItemCounted,
  checkItemScanStatus,
  getItemByIdentifier,
  getSessionSqlVariance,
  searchItems,
} from "@/services/api/api";
import { localDb } from "@/db/localDb";
import apiClient from "@/services/httpClient";
import { RecentItemsService } from "@/services/enhancedFeatures";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";
import { toastService } from "@/services/toastService";
import { Item } from "@/types/scan";
import { getStockQty, sortItemsByStockDesc } from "@/utils/itemBatchUtils";
import { getReadableInventoryErrorMessage } from "./errorMessages";
import { toVarianceViewModel } from "@/viewModels/varianceAdapter";
import type { VarianceViewModel } from "@/viewModels/types";

type MrpVariant = Record<string, any> & {
  id?: string | number;
  value?: number;
};

export type ItemDetailItem = Item & {
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
  const [varianceVm, setVarianceVm] = useState<VarianceViewModel | null>(null);

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
          itemData = (await getItemByIdentifier(barcode, 1)) as ItemDetailItem | null;
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

      // Fetch canonical session variance (P0B — canonical variance panel).
      // The backend computes audit_delta, operational_delta, and
      // movement_adjusted_expected via SqlVarianceEngine; the adapter maps
      // them verbatim. No frontend recomputation (authority-boundary guard).
      if (sessionId && !offlineMode && itemData.item_code) {
        void (async () => {
          try {
            const varianceData = await getSessionSqlVariance(sessionId);
            if (!varianceData?.data) {
              setVarianceVm(null);
              return;
            }

            const itemVariance = varianceData.data.variance_by_item?.find(
              (entry) => entry.item_code === itemData.item_code
            );

            if (!itemVariance) {
              setVarianceVm(null);
              return;
            }

            const erpQty = itemData.current_stock ?? itemData.stock_qty;

            setVarianceVm(
              toVarianceViewModel({
                ...itemVariance,
                movement_adjusted_expected:
                  varianceData.data.movement_adjusted_expected,
                movement_adjusted: varianceData.data.movement_adjusted_expected,
                item_name: itemData.item_name || itemData.name,
                erp_qty: erpQty,
                baseline_qty: erpQty,
                baseline_source: "Session snapshot",
                counted_by: currentUsername,
                counted_at: (itemData as unknown as Record<string, unknown>).counted_at,
                floor: currentFloor,
                rack: currentRack,
              })
            );
          } catch (error) {
            __DEV__ && console.error("Error loading session variance:", error);
            setVarianceVm(null);
          }
        })();
      }

      await RecentItemsService.addRecent(itemData.item_code || barcode, itemData);

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

    setIsRefreshing(true);
    try {
      const targetIdentifier = item?.item_code || item?.barcode || barcode;
      const response = await apiClient.get(`/api/v2/items/${targetIdentifier}?verify_sql=true`);

      if (response.data.success && response.data.data) {
        const isSqlVerified =
          response.data.data.sql_verified === true ||
          response.data.meta?.sql_verified === true;

        if (isSqlVerified) {
          setItem((previous) => ({
            ...previous,
            ...response.data.data,
            _source: "sql",
          }));
          toastService.show("Stock refreshed from SQL", { type: "success" });
        } else {
          setItem((previous) => ({
            ...previous,
            ...response.data.data,
            _source: "cache",
          }));
          toastService.show(
            "SQL Server unavailable — displaying cached item details",
            { type: "warning" }
          );
        }
      }
    } catch (error: any) {
      if (error.response?.status === 503) {
        toastService.show(
          "Live stock is unavailable right now. Showing the last known item details.",
          { type: "warning" }
        );
      } else {
        toastService.show(getReadableInventoryErrorMessage(error, "refresh-stock"), {
          type: "error",
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [barcode, item, offlineMode]);

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
    loading,
    mrpVariants,
    rawVariantsCount: rawVariants.length,
    recountBlockedReason,
    recountTargetId,
    sameNameVariants,
    selectedMrpVariant,
    setShowZeroStock,
    showZeroStock,
    blindRecountRequired,
    varianceVm,
  };
};
