import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";

import {
  checkItemCounted,
  checkItemScanStatus,
  getItemByBarcode,
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

const normalizeBatchIdentityText = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const mapBatchVariant = (batch: any, fallbackItemCode: string): ItemDetailItem => {
  const stockQty = getStockQty(batch);
  return {
    ...batch,
    item_code: batch.item_code ?? fallbackItemCode,
    barcode: batch.barcode ?? batch.auto_barcode ?? batch.autobarcode ?? "",
    stock_qty: stockQty,
    current_stock: stockQty,
    mrp: batch.mrp ?? null,
    manufacturing_date: batch.manufacturing_date ?? batch.mfg_date ?? null,
  } as ItemDetailItem;
};

const mergeBatchVariants = (variants: ItemDetailItem[]): ItemDetailItem[] => {
  const byBarcode = new Map<string, ItemDetailItem>();
  const unkeyed: ItemDetailItem[] = [];

  for (const variant of variants) {
    const key = normalizeBatchIdentityText(variant.barcode);
    if (!key) {
      unkeyed.push(variant);
      continue;
    }
    byBarcode.set(key, { ...byBarcode.get(key), ...variant });
  }

  return [...byBarcode.values(), ...unkeyed];
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
    if (!rawVariants.length || !item) return [];

    const currentBarcode = normalizeBatchIdentityText(item.barcode || barcode);
    const currentCode = normalizeBatchIdentityText(item.item_code);
    const currentName = normalizeBatchIdentityText(item.item_name || item.name);

    const filtered = rawVariants.filter((variant) => {
      const variantBarcode = normalizeBatchIdentityText(variant.barcode);
      const variantCode = normalizeBatchIdentityText(variant.item_code);
      const variantName = normalizeBatchIdentityText(variant.item_name || variant.name);
      const sameProduct =
        Boolean(currentCode && variantCode === currentCode) ||
        Boolean(currentName && variantName === currentName);

      if (!sameProduct) return false;
      if (variantBarcode && currentBarcode && variantBarcode === currentBarcode) return false;
      if (!showZeroStock && getStockQty(variant) <= 0) return false;
      return true;
    });

    return sortItemsByStockDesc(filtered);
  }, [barcode, item, rawVariants, showZeroStock]);

  const batchCountVariants = useMemo(() => {
    if (!rawVariants.length || !item) return [];

    const currentBarcode = normalizeBatchIdentityText(item.barcode || barcode);
    const currentCode = normalizeBatchIdentityText(item.item_code);
    const currentName = normalizeBatchIdentityText(item.item_name || item.name);
    const currentBatch = mapBatchVariant(
      {
        ...item,
        barcode: item.barcode || barcode,
        batch_id: item.batch_id || item.barcode || barcode,
        batch_no: (item as any).batch_no || item.batch_id || item.barcode || barcode,
      },
      item.item_code || barcode || ""
    );

    const sameProductVariants = rawVariants.filter((variant) => {
      const variantCode = normalizeBatchIdentityText(variant.item_code);
      const variantName = normalizeBatchIdentityText(variant.item_name || variant.name);
      return (
        Boolean(currentCode && variantCode === currentCode) ||
        Boolean(currentName && variantName === currentName)
      );
    });

    const merged = mergeBatchVariants([currentBatch, ...sameProductVariants]);
    const filtered = merged.filter((variant) => {
      const variantBarcode = normalizeBatchIdentityText(variant.barcode);
      const isCurrent = Boolean(
        currentBarcode && variantBarcode && variantBarcode === currentBarcode
      );
      return isCurrent || showZeroStock || getStockQty(variant) > 0;
    });

    const currentRows: ItemDetailItem[] = [];
    const otherRows: ItemDetailItem[] = [];
    for (const variant of filtered) {
      const variantBarcode = normalizeBatchIdentityText(variant.barcode);
      if (currentBarcode && variantBarcode && variantBarcode === currentBarcode) {
        currentRows.push(variant);
      } else {
        otherRows.push(variant);
      }
    }

    return [...currentRows, ...sortItemsByStockDesc(otherRows)];
  }, [barcode, item, rawVariants, showZeroStock]);

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
      const itemData = offlineMode
        ? ((await localDb.getItemByBarcode(barcode)) as ItemDetailItem | null)
        : ((await getItemByBarcode(
            barcode,
            3,
            sessionId || undefined,
            currentRack || undefined
          )) as ItemDetailItem | null);

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
      const targetBarcode = item?.barcode || barcode;
      const response = await apiClient.get(`/api/v2/items/${targetBarcode}?verify_sql=true`);

      if (response.data.success && response.data.data) {
        setItem((previous) => ({
          ...previous,
          ...response.data.data,
          _source: "sql",
        }));
        toastService.show("Stock refreshed from SQL", { type: "success" });
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

        const mappedBatches: ItemDetailItem[] = batches.map((batch: any) =>
          mapBatchVariant(batch, item.item_code)
        );

        const currentItemName = normalizeBatchIdentityText(item.item_name || item.name);
        const currentBarcode = normalizeBatchIdentityText(item.barcode || barcode);
        const hasOtherSameNameBatch = mappedBatches.some(
          (batch) =>
            normalizeBatchIdentityText(batch.item_name || batch.name) === currentItemName &&
            normalizeBatchIdentityText(batch.barcode) !== currentBarcode
        );

        if (currentItemName && !hasOtherSameNameBatch) {
          const results = await searchItems(
            item.item_name || item.name || item.item_code,
            undefined,
            50
          );
          const sameNameResults = (results.items || [])
            .filter(
              (result) =>
                normalizeBatchIdentityText(result.item_name || result.name) === currentItemName
            )
            .map((result) => mapBatchVariant(result, item.item_code));

          setRawVariants(mergeBatchVariants([...mappedBatches, ...sameNameResults]));
          return;
        }

        setRawVariants(mergeBatchVariants(mappedBatches));
      } catch (error) {
        console.warn("Failed to load batches:", error);
        try {
          const fallbackQuery = item.item_name || item.name || item.item_code;
          const results = offlineMode
            ? { items: await localDb.searchItems(fallbackQuery) }
            : await searchItems(fallbackQuery, undefined, 50);
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
  }, [barcode, item, offlineMode]);

  return {
    batchError,
    batchLoading,
    handleRefreshStock,
    handleSelectMrpVariant,
    isRefreshing,
    item,
    loading,
    mrpVariants,
    batchCountVariants,
    rawVariantsCount: rawVariants.length,
    recountBlockedReason,
    recountTargetId,
    sameNameVariants,
    selectedMrpVariant,
    setShowZeroStock,
    showZeroStock,
    blindRecountRequired,
  };
};
