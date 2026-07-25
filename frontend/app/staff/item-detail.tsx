/**
 * Modern Item Detail Screen - Lavanya Mart Stock Verify
 * Clean, efficient item verification interface
 */

import { useState, useEffect, useCallback, useMemo, memo } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useScanSessionStore } from "@/store/scanSessionStore";
import { useSettingsStore } from "@/store/settingsStore";

import ModernHeader from "@/components/ui/ModernHeader";
import ModernButton from "@/components/ui/ModernButton";
import ModernCard from "@/components/ui/ModernCard";
import { ThemedScreen } from "@/components/ui/ThemedScreen";
import { BatchVariantsSection } from "@/components/scan/BatchVariantsSection";
import { CountQuantitySection } from "@/components/scan/CountQuantitySection";
import { EvidenceNotesSection } from "@/components/scan/EvidenceNotesSection";
import { ItemDateFieldsSection } from "@/components/scan/ItemDateFieldsSection";
import { ItemDetailModals } from "@/components/scan/ItemDetailModals";
import { ItemMrpSection } from "@/components/scan/ItemMrpSection";
import { ItemSubmitBar } from "@/components/scan/ItemSubmitBar";
// ItemSummarySection removed — hero card is now the single source of item identity
import { SerializedItemSection } from "@/components/scan/SerializedItemSection";
import { PhotoCaptureModal } from "@/components/modals/PhotoCaptureModal";
import { usePerformanceMonitor } from "@/hooks/usePerformanceMonitor";
import { useDeferredItemSubmission } from "@/domains/inventory/hooks/scan/useDeferredItemSubmission";
import { useItemDraftAutosave } from "@/domains/inventory/hooks/scan/useItemDraftAutosave";
import { useItemDetailData } from "@/domains/inventory/hooks/scan/useItemDetailData";
import { useSessionWebSocket } from "@/hooks/useSessionWebSocket";
import { useItemEvidenceState } from "@/domains/inventory/hooks/scan/useItemEvidenceState";
import { useItemMetadataState } from "@/domains/inventory/hooks/scan/useItemMetadataState";
import { useQuantityCountManager } from "@/domains/inventory/hooks/scan/useQuantityCountManager";
import { useSerialEntryManager } from "@/domains/inventory/hooks/scan/useSerialEntryManager";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getDecorativeIconProps } from "@/utils/accessibility";
import { safeBackNavigation } from "@/utils/navigation";
import { createItemDetailStyles } from "@/styles/screens/ItemDetail.styles";
import { getStockQty } from "@/utils/itemBatchUtils";
import { createLogger } from "@/services/logging";

const log = createLogger("ItemDetailScreen");

const formatMetricNumber = (value: number | undefined | null): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "---";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
};

const formatStockMetric = (
  value: number | undefined | null,
  unit: string | undefined,
  visible: boolean
): string => {
  if (!visible) return "---";
  const formattedValue = formatMetricNumber(value);
  if (formattedValue === "---") return formattedValue;
  return unit ? `${formattedValue} ${unit}` : formattedValue;
};

const formatPriceMetric = (value: number | undefined | null, visible: boolean): string => {
  if (!visible) return "---";
  const formattedValue = formatMetricNumber(value);
  return formattedValue === "---" ? formattedValue : `₹${formattedValue}`;
};

// Reusable section heading — consistent icon + label pattern, avoids 7× repetition
const SectionHeading = memo(function SectionHeading({
  icon,
  label,
  uiTokens,
  decorativeIconProps,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  uiTokens: ReturnType<typeof import("@/hooks/useUiTokens").useUiTokens>;
  decorativeIconProps: ReturnType<typeof getDecorativeIconProps>;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, marginBottom: 4, paddingHorizontal: 2 }}>
      <Ionicons {...decorativeIconProps} name={icon} size={14} color={uiTokens.colors.textMuted} />
      <Text style={{ fontSize: 11, fontWeight: "700", color: uiTokens.colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </Text>
    </View>
  );
});

const MemoizedCountQuantitySection = memo(CountQuantitySection);
const MemoizedItemMrpSection = memo(ItemMrpSection);
const MemoizedItemDateFieldsSection = memo(ItemDateFieldsSection);
const MemoizedSerializedItemSection = memo(SerializedItemSection);
const MemoizedBatchVariantsSection = memo(BatchVariantsSection);
const MemoizedEvidenceNotesSection = memo(EvidenceNotesSection);
const MemoizedItemSubmitBar = memo(ItemSubmitBar);

interface ManualBatchEntryProps {
  batch: {
    id: string;
    quantity?: string;
    mrp?: string;
    mfgDate?: string;
    expiryDate?: string;
    condition?: string;
  };
  index: number;
  uiTokens: ReturnType<typeof useUiTokens>;
  onFieldChange: (index: number, field: string, value: string) => void;
  onRemove: (index: number) => void;
}

const ManualBatchEntry = memo(function ManualBatchEntry({
  batch,
  index,
  uiTokens,
  onFieldChange,
  onRemove,
}: ManualBatchEntryProps) {
  return (
    <ModernCard style={{ padding: uiTokens.spacing.md, gap: uiTokens.spacing.sm, marginBottom: uiTokens.spacing.sm }}>
      <View style={{ flexDirection: "row", gap: uiTokens.spacing.sm, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 80 }}>
          <Text style={{ fontSize: 11, color: uiTokens.colors.textSecondary, marginBottom: 4 }}>Qty</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: uiTokens.colors.border, borderRadius: uiTokens.radius.md, paddingHorizontal: uiTokens.spacing.sm, paddingVertical: uiTokens.spacing.xs, color: uiTokens.colors.textPrimary }}
            placeholder="0"
            placeholderTextColor={colorWithAlpha(uiTokens.colors.textSecondary, 0.6)}
            keyboardType="numeric"
            value={batch.quantity}
            onChangeText={(text) => onFieldChange(index, "quantity", text)}
          />
        </View>
        <View style={{ flex: 1, minWidth: 80 }}>
          <Text style={{ fontSize: 11, color: uiTokens.colors.textSecondary, marginBottom: 4 }}>MRP</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: uiTokens.colors.border, borderRadius: uiTokens.radius.md, paddingHorizontal: uiTokens.spacing.sm, paddingVertical: uiTokens.spacing.xs, color: uiTokens.colors.textPrimary }}
            placeholder="0"
            placeholderTextColor={colorWithAlpha(uiTokens.colors.textSecondary, 0.6)}
            keyboardType="numeric"
            value={batch.mrp}
            onChangeText={(text) => onFieldChange(index, "mrp", text)}
          />
        </View>
        <View style={{ flex: 1, minWidth: 80 }}>
          <Text style={{ fontSize: 11, color: uiTokens.colors.textSecondary, marginBottom: 4 }}>MFG Date</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: uiTokens.colors.border, borderRadius: uiTokens.radius.md, paddingHorizontal: uiTokens.spacing.sm, paddingVertical: uiTokens.spacing.xs, color: uiTokens.colors.textPrimary }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colorWithAlpha(uiTokens.colors.textSecondary, 0.6)}
            value={batch.mfgDate}
            onChangeText={(text) => onFieldChange(index, "mfgDate", text)}
          />
        </View>
        <View style={{ flex: 1, minWidth: 80 }}>
          <Text style={{ fontSize: 11, color: uiTokens.colors.textSecondary, marginBottom: 4 }}>Expiry Date</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: uiTokens.colors.border, borderRadius: uiTokens.radius.md, paddingHorizontal: uiTokens.spacing.sm, paddingVertical: uiTokens.spacing.xs, color: uiTokens.colors.textPrimary }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colorWithAlpha(uiTokens.colors.textSecondary, 0.6)}
            value={batch.expiryDate}
            onChangeText={(text) => onFieldChange(index, "expiryDate", text)}
          />
        </View>
        <TouchableOpacity
          style={{ alignSelf: "flex-end", paddingVertical: uiTokens.spacing.xs, paddingHorizontal: uiTokens.spacing.sm }}
          onPress={() => onRemove(index)}
        >
          <Text style={{ color: uiTokens.colors.warning, fontWeight: "700", fontSize: 12 }}>Remove</Text>
        </TouchableOpacity>
      </View>
    </ModernCard>
  );
});

export default function ItemDetailScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const decorativeIconProps = getDecorativeIconProps();
  const params = useLocalSearchParams<{ barcode: string; sessionId: string }>();
  const { barcode, sessionId } = params;
  const displayBarcode = Array.isArray(barcode) ? barcode[0] : barcode;
  const normalizedSessionId = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  const { isConnected, subscribe } = useSessionWebSocket(normalizedSessionId);
  const { renderCount, scrollFPS } = usePerformanceMonitor("ItemDetailScreen", {
  trackScrollFPS: true,
});

  // Log performance metrics
  useEffect(() => {
    log.debug("ItemDetail Performance", {
      renderCount,
      scrollFPS,
      itemId: displayBarcode,
    });
  }, [renderCount, scrollFPS, displayBarcode]);

  const { currentFloor, currentRack } = useScanSessionStore();
  const { settings } = useSettingsStore();

  // Form State
  const [quantity, setQuantity] = useState("0");
  const [mrp, setMrp] = useState("");
  const [condition] = useState("Good");
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchQuantities, setBatchQuantities] = useState<Record<string, string>>({});
  const [manualBatches, setManualBatches] = useState<
    Array<{
      id: string;
      quantity?: string;
      mrp?: string;
      mfgDate?: string;
      expiryDate?: string;
      condition?: string;
    }>
  >([]);
  const styles = useMemo(
    () => createItemDetailStyles(uiTokens),
    [uiTokens]
  );

  const handleBackPress = useCallback(() => {
    safeBackNavigation(router, {
      sessionFallbackHref: normalizedSessionId
        ? `/staff/scan?sessionId=${encodeURIComponent(normalizedSessionId)}`
        : undefined,
      userRole: "staff",
    });
  }, [normalizedSessionId, router]);

  const {
    batchError,
    batchLoading,
    blindRecountRequired,
    handleRefreshStock,
    handleSelectMrpVariant,
    isRefreshing,
    item,
    lastErpRefresh,
    loading,
    mrpVariants,
    rawVariantsCount,
    recountBlockedReason,
    recountTargetId,
    refreshStatus,
    sameNameVariants,
    selectedMrpVariant,
    setShowZeroStock,
    showZeroStock,
  } = useItemDetailData({
    barcode: displayBarcode,
    sessionId: normalizedSessionId,
    currentFloor,
    currentRack,
    onBackPress: handleBackPress,
    onMrpChange: setMrp,
    onQuantityChange: setQuantity,
});

  // Refresh item data on WebSocket update
  useEffect(() => {
    if (!normalizedSessionId || !displayBarcode) return;

    return subscribe("item-updated", (message) => {
      // @ts-ignore - log is globally available or imported elsewhere, assuming it works as before
      if (typeof log !== 'undefined') {
        log.debug("WebSocket event received", {
          event: message.type,
          itemId: message.itemId,
          sessionId: message.sessionId,
        });
      }
      if (message.itemId === displayBarcode) {
        handleRefreshStock();
      }
    });
  }, [normalizedSessionId, displayBarcode, subscribe, handleRefreshStock]);

 const {
        handleAddSplitCount,
       handleClearSplitCounts,
       handleDecrement,
       handleIncrement,
       handleQuantityBlur,
       handleQuantityChange,
       handleRemoveSplitCount,
       handleSplitCountBlur,
       handleSplitCountChange,
       handleToggleSplitMode,
       isSplitMode,
       isWeightBasedUOM,
       resetQuantityState,
       splitCounts,
       uomInfo,
     } = useQuantityCountManager({
       item,
       quantity,
       setQuantity,
     });
  const {
    closePhotoCapture,
    damagePhoto,
    damageQty,
    damageType,
    handleAddItemPhoto,
    handlePhotoCaptured,
    handleTakeDamagePhoto,
    isDamageEnabled,
    itemPhotos,
    photoCaptureTitle,
    photoCaptureVisible,
    remark,
    removeDamagePhoto,
    removeItemPhoto,
    resetEvidenceState,
    setDamageQty,
    setDamageType,
    setIsDamageEnabled,
    setRemark,
    setVarianceRemark,
    varianceRemark,
  } = useItemEvidenceState();
  const {
    expiryDateField,
    hasExpiryDate,
    hasMfgDate,
    itemExpiryDate,
    itemExpiryDateFormat,
    itemMfgDate,
    itemMfgDateFormat,
    mfgDateField,
    mrpEditable,
    resetMetadataState,
    setMrpEditable,
    toggleExpiryDateEnabled,
    toggleMfgDateEnabled,
  } = useItemMetadataState();


  const {
    handleAddSerial,
    handleRemoveSerial,
    handleSerialBlur,
    handleSerialChange,
    handleSerialScanned,
    isSerializedItem,
    resetSerialState,
    serialEntries,
    serialNumbers,
    serialValidationErrors,
    serialValidationMessages,
    setIsSerializedItem,
    setShowSerialScanner,
    showSerialScanner,
    validateSerials,
  } = useSerialEntryManager({
    item,
    mrp,
    quantity,
    sessionId: normalizedSessionId,
    onQuantityChange: setQuantity,
  });


  useEffect(() => {
    const itemResetKey = item?.barcode || item?.item_code;
    if (!itemResetKey) return;
    resetSerialState();
    resetQuantityState();
    resetEvidenceState();
    resetMetadataState();
    // Serial-controlled items must expose serial capture without the staff
    // first flipping the "Is Serialized Item" switch — otherwise the manual
    // "Add Serial" input never renders. resetSerialState() sets this false, so
    // re-enable from the item's tracking metadata in the same pass.
    if (item?.is_serialized) {
      setIsSerializedItem(true);
    }
  }, [
    item?.barcode,
    item?.item_code,
    item?.is_serialized,
    resetEvidenceState,
    resetMetadataState,
    resetQuantityState,
    resetSerialState,
    setIsSerializedItem,
  ]);

  const existingBatches = useMemo(() => {
    if (!isBatchMode || !sameNameVariants || sameNameVariants.length === 0) return [];
    return sameNameVariants
      .map((variant: any, index: number) => {
        const variantKey =
          variant._id ??
          [variant.item_code, variant.barcode, variant.batch_no, `idx-${index}`]
            .filter((value: any) => value !== undefined && value !== null && value !== "")
            .join(":");
        const qty = parseFloat(batchQuantities[variantKey] || "0");
        if (qty <= 0) return null;
        return {
          batch_id: variant.batch_id || variant.batch_no || undefined,
          batch_number: variant.batch_no || undefined,
          batch_no: variant.batch_no || undefined,
          barcode: variant.barcode || undefined,
          quantity: qty,
          mrp: variant.mrp ? Number(variant.mrp) : undefined,
          manufacturing_date: variant.manufacturing_date || variant.mfg_date || undefined,
          expiry_date: variant.expiry_date || undefined,
          item_condition: "No Issue",
          stock_qty: getStockQty(variant),
        };
      })
      .filter(Boolean) as any[];
  }, [isBatchMode, sameNameVariants, batchQuantities]);

  const manualBatchEntries = useMemo(() => {
    if (!isBatchMode) return [];
    return manualBatches
      .map((batch) => {
        const qty = parseFloat(batch.quantity || "0");
        if (qty <= 0) return null;
        return {
          batch_number: `BATCH-${batch.id || Date.now()}`,
          quantity: qty,
          mrp: batch.mrp ? Number(batch.mrp) : undefined,
          manufacturing_date: batch.mfgDate || undefined,
          expiry_date: batch.expiryDate || undefined,
          item_condition: batch.condition || "No Issue",
        };
      })
      .filter(Boolean) as any[];
  }, [isBatchMode, manualBatches]);

  const batchesForSubmission = useMemo(() => {
    if (!isBatchMode) return undefined;
    const combined = [...existingBatches, ...manualBatchEntries];
    return combined.length > 0 ? combined : undefined;
  }, [isBatchMode, existingBatches, manualBatchEntries]);

  const effectiveQuantity = useMemo(() => {
    if (!isBatchMode) return quantity;
    const total = (batchesForSubmission || []).reduce(
      (sum, batch) => sum + (Number(batch.quantity) || 0),
      0
    );
    return String(total);
  }, [isBatchMode, quantity, batchesForSubmission]);

  const { submitting, submitCountdown, cancelSubmit, executeSubmit, validateBeforeSubmit } =
    useDeferredItemSubmission({
      barcode: displayBarcode,
      sessionId: normalizedSessionId,
      currentFloor,
      currentRack,
      item,
      quantity: effectiveQuantity,
      condition,
      remark,
      isDamageEnabled,
      damageQty,
      damageType,
      damagePhoto,
      itemPhotos,
      isSerializedItem,
      serialEntries,
      serialNumbers,
      serialValidationErrors,
      validateSerials,
      varianceRemark,
      mrp,
      hasMfgDate,
      itemMfgDate,
      itemMfgDateFormat,
      hasExpiryDate,
      itemExpiryDate,
      itemExpiryDateFormat,
      isBatchMode,
      batches: batchesForSubmission,
      batchQuantities,
      // Recount controls — enforce blocking/blind-recount in the submit guard,
      // not just the visual banner.
      recountTargetId,
      blindRecountRequired,
      recountBlockedReason,
      onSuccess: handleBackPress,
    });

  const handleSubmitAndScanNext = useCallback(async () => {
    if (!validateBeforeSubmit()) return;
    const res = await executeSubmit();
    if (res?.success && normalizedSessionId) {
      router.replace({
        pathname: "/staff/scan",
        params: { sessionId: normalizedSessionId, resumeCamera: "1" },
      });
    }
  }, [executeSubmit, normalizedSessionId, router, validateBeforeSubmit]);

  const handleSubmitAndStay = useCallback(async () => {
    if (!validateBeforeSubmit()) return;
    await executeSubmit();
  }, [executeSubmit, validateBeforeSubmit]);

  const handleSelectVariant = useCallback((variantBarcode: string) => {
    router.replace({
      pathname: "/staff/item-detail",
      params: normalizedSessionId
        ? { barcode: variantBarcode, sessionId: normalizedSessionId }
        : { barcode: variantBarcode },
    });
  }, [normalizedSessionId, router]);

  const handleBatchQuantityChange = useCallback((variantKey: string, value: string) => {
    setBatchQuantities((prev) => ({ ...prev, [variantKey]: value }));
  }, []);

  const handleBatchFieldChange = useCallback((index: number, field: string, value: string) => {
    setManualBatches((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value } as typeof prev[0];
      return next;
    });
  }, []);

  const handleRemoveBatch = useCallback((index: number) => {
    setManualBatches((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleAddBatch = useCallback(() => {
    setManualBatches((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        quantity: "",
        mrp: "",
        mfgDate: "",
        expiryDate: "",
        condition: "No Issue",
      },
    ]);
  }, []);

  useItemDraftAutosave({
    currentFloor,
    currentRack,
    item,
    mrp,
    quantity,
    remark,
    sessionId: normalizedSessionId,
    submitting,
  });

  // Sync quantity with serial entries count for serialized items
  if (loading) {
    return (
      <ThemedScreen showPattern={false} variant="solid">
        <ModernHeader title="Verify Item" showBackButton onBackPress={handleBackPress} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={uiTokens.colors.accent} />
          <Text style={styles.loadingText}>Loading item details...</Text>
        </View>
      </ThemedScreen>
    );
  }

  if (!item) {
    return (
      <ThemedScreen showPattern={false} variant="solid">
        <ModernHeader title="Verify Item" showBackButton onBackPress={handleBackPress} />
        <View style={styles.errorContainer}>
          <ModernCard style={styles.errorCard}>
            <Ionicons
              {...decorativeIconProps}
              name="alert-circle-outline"
              size={52}
              color={uiTokens.colors.error}
              style={{ alignSelf: "center" }}
            />
            <Text style={styles.errorTitle}>Item Not Found</Text>
            <Text style={styles.errorText}>
              We could not retrieve details for this barcode in the current session.
            </Text>
            <ModernButton
              title="Back to Scan"
              onPress={handleBackPress}
              fullWidth
              icon="arrow-back-circle-outline"
            />
          </ModernCard>
        </View>
      </ThemedScreen>
    );
  }

  const itemName = item.item_name || item.name || "Unnamed item";
  const itemCode = item.item_code || displayBarcode || "N/A";
  const itemStock = item.current_stock ?? item.stock_qty;
  const itemUnit = item.uom_name || item.uom_code || item.uom || uomInfo.unit;

  const sourceStatus = (() => {
    if (isRefreshing) {
      return { label: "Refreshing", icon: "sync-outline" as const, color: uiTokens.colors.info };
    }
    if (refreshStatus === "success") {
      return { label: "Updated", icon: "checkmark-circle-outline" as const, color: uiTokens.colors.success };
    }

    const sqlAvailable = item?.sql_available;
    const syncStale = item?.sync_stale;
    const source = lastErpRefresh?.source;
    const quantitySource = item?.quantity_source;

    if (source === "cached" || sqlAvailable === false || quantitySource === "sync_cache") {
      return { label: "Cached", icon: "cloud-offline-outline" as const, color: uiTokens.colors.warning };
    }
    if (syncStale) {
      return { label: "Stale", icon: "alert-circle-outline" as const, color: uiTokens.colors.warning };
    }
    if (
      source === "sql_server" ||
      sqlAvailable === true ||
      quantitySource === "sql_verification"
    ) {
      return { label: "ERP Live", icon: "checkmark-circle-outline" as const, color: uiTokens.colors.success };
    }

    if (item?._source === "cache") {
      return { label: "Cached", icon: "cloud-offline-outline" as const, color: uiTokens.colors.warning };
    }
    if (item?._source === "sql") {
      return { label: "ERP Live", icon: "checkmark-circle-outline" as const, color: uiTokens.colors.success };
    }

    return { label: "Live", icon: "shield-checkmark-outline" as const, color: uiTokens.colors.info };
  })();

  const heroStockValue = formatStockMetric(itemStock, itemUnit, settings.showItemStock);
  const heroMrpValue   = formatPriceMetric(item.mrp, settings.showItemPrices && settings.columnVisibility.mrp);
  const sessionBaselineValue = normalizedSessionId
    ? (item.session_baseline ?? item.baseline_qty)
    : undefined;
  const heroBaselineValue = formatStockMetric(sessionBaselineValue, itemUnit, settings.showItemStock);

  const refreshMetaLines = (() => {
    if (!lastErpRefresh) return null;
    const lines = [
      `Last checked: ${new Date(lastErpRefresh.checkedAt.includes('T') && !lastErpRefresh.checkedAt.endsWith('Z') && !lastErpRefresh.checkedAt.match(/[+-]\\d{2}:\\d{2}$/) ? lastErpRefresh.checkedAt + 'Z' : lastErpRefresh.checkedAt).toLocaleString()}`,
      `Source: ${lastErpRefresh.source === "sql_server" ? "SQL Server" : "Cached"}`,
    ];
    if (lastErpRefresh.scope) {
      lines.push(`Scope: ${lastErpRefresh.scope === "batch" ? "Batch" : "Item total"}`);
    }
    return lines;
  })();

  const parsedQuantity = Number.parseFloat(effectiveQuantity);
  const canSubmit = Number.isFinite(parsedQuantity) && parsedQuantity > 0;
  const shouldShowBatchVariants =
    isBatchMode || batchLoading || Boolean(batchError) || rawVariantsCount > 0 || sameNameVariants.length > 0;

  // Location context — compact string for subtitle
  const locationLabel = [currentFloor, currentRack].filter(Boolean).join(" › ") || "No location";

  return (
    <ThemedScreen showPattern={false} variant="solid" dismissKeyboardOnTap>
      <ModernHeader
        title={itemName}
        subtitle={locationLabel}
        showBackButton
        showSettingsButton={false}
        onBackPress={handleBackPress}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
          bounces
          alwaysBounceVertical
          removeClippedSubviews={Platform.OS === "ios"}
          onScroll={() => {
            // Performance instrumentation for scroll FPS
            if (scrollFPS !== undefined) {
              log.debug("ItemDetail Performance", {
                renderCount,
                scrollFPS,
                itemId: item?.item_code,
              });
            }
          }}
          scrollEventThrottle={16}
        >
          {/* ── Hero Card ─── single source of truth for item identity ─── */}
          <ModernCard style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <Ionicons
                  {...decorativeIconProps}
                  name="scan-circle-outline"
                  size={28}
                  color={uiTokens.colors.accentStrong}
                />
              </View>

              <View style={styles.heroCopy}>
                <Text
                  style={styles.heroTitle}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {itemName}
                </Text>

                <View style={styles.heroCodeRow}>
                  {/* Barcode */}
                  <View style={[styles.heroPill, styles.heroPillStrong]}>
                    <Ionicons {...decorativeIconProps} name="barcode-outline" size={13} color={uiTokens.colors.accentStrong} />
                    <Text style={[styles.heroPillText, styles.heroPillTextStrong]} numberOfLines={1}>
                      {displayBarcode || itemCode}
                    </Text>
                  </View>

                  {/* Item code (only if different from barcode) */}
                  {itemCode !== displayBarcode && (
                    <View style={styles.heroPill}>
                      <Ionicons {...decorativeIconProps} name="pricetag-outline" size={13} color={uiTokens.colors.textSecondary} />
                      <Text style={styles.heroPillText} numberOfLines={1}>{itemCode}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Session baseline — shown separately from CURRENT ERP STOCK whenever this
                verification is tied to a session, so an ERP refresh never reads as a
                baseline change. */}
            {sessionBaselineValue != null && (
              <View style={styles.heroMetrics}>
                <View style={styles.heroMetricTile}>
                  <Text style={styles.heroMetricLabel}>SESSION BASELINE</Text>
                  <Text style={styles.heroMetricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                    {heroBaselineValue}
                  </Text>
                </View>
              </View>
            )}

            {/* Metrics row — flat 2x2 grid */}
            <View style={[styles.heroMetrics, { flexDirection: "column", gap: uiTokens.spacing.sm }]}>
              {/* Row 1: Stock & Refresh */}
              <View style={{ flexDirection: "row", gap: uiTokens.spacing.sm, width: "100%" }}>
                <View style={[styles.heroMetricTile, { flex: 2, padding: uiTokens.spacing.md, backgroundColor: colorWithAlpha(uiTokens.colors.surface, 0.5), borderWidth: 0 }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: uiTokens.spacing.sm, flexWrap: "wrap", justifyContent: "space-between", marginBottom: uiTokens.spacing.xs }}>
                    <Text style={[styles.heroMetricLabel, { color: uiTokens.colors.textSecondary }]}>CURRENT ERP STOCK</Text>
                    <View
                      style={[
                        styles.sourcePill,
                        {
                          backgroundColor: colorWithAlpha(sourceStatus.color, uiTokens.mode === "dark" ? 0.2 : 0.1),
                          borderColor: 'transparent',
                        },
                      ]}
                    >
                      <Ionicons {...decorativeIconProps} name={sourceStatus.icon} size={13} color={sourceStatus.color} />
                      <Text style={[styles.sourcePillText, { color: sourceStatus.color }]} numberOfLines={1} ellipsizeMode="tail">
                        {sourceStatus.label}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.heroMetricValue, { textAlign: "left", fontSize: 28 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                    {heroStockValue}
                  </Text>
                </View>

                {/* Refresh Action */}
                <TouchableOpacity
                  style={[
                    styles.heroMetricTile,
                    {
                      flex: 1,
                      backgroundColor: isRefreshing || refreshStatus === "success" 
                        ? colorWithAlpha(uiTokens.colors.success, 0.1) 
                        : colorWithAlpha(uiTokens.colors.accent, 0.1),
                      borderWidth: 0,
                      justifyContent: "center",
                      alignItems: "center",
                    },
                  ]}
                  onPress={handleRefreshStock}
                  disabled={isRefreshing || refreshStatus === "success"}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh stock from ERP"
                >
                  {isRefreshing ? (
                    <View style={{ alignItems: "center", gap: 4 }}>
                      <ActivityIndicator size="small" color={uiTokens.colors.accent} />
                      <Text style={[styles.heroMetricLabel, { color: uiTokens.colors.accent, fontSize: 10 }]}>SYNCING</Text>
                    </View>
                  ) : refreshStatus === "success" ? (
                    <View style={{ alignItems: "center", gap: 4 }}>
                      <Ionicons {...decorativeIconProps} name="checkmark-circle" size={24} color={uiTokens.colors.success} />
                      <Text style={[styles.heroMetricLabel, { color: uiTokens.colors.success, fontSize: 10 }]}>UPDATED</Text>
                    </View>
                  ) : (
                    <View style={{ alignItems: "center", gap: 4 }}>
                      <Ionicons {...decorativeIconProps} name="refresh" size={24} color={uiTokens.colors.accent} />
                      <Text style={[styles.heroMetricLabel, { color: uiTokens.colors.accent, fontSize: 10 }]}>REFRESH</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Row 2: Price & Unit */}
              <View style={{ flexDirection: "row", gap: uiTokens.spacing.sm, width: "100%" }}>
                <View style={[styles.heroMetricTile, { flex: 1, backgroundColor: colorWithAlpha(uiTokens.colors.surface, 0.5), borderWidth: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
                  <Text style={[styles.heroMetricLabel, { color: uiTokens.colors.textSecondary }]}>MRP / PRICE</Text>
                  <Text style={[styles.heroMetricValue, { fontSize: 16 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                    {heroMrpValue}
                  </Text>
                </View>
                <View style={[styles.heroMetricTile, { flex: 1, backgroundColor: colorWithAlpha(uiTokens.colors.surface, 0.5), borderWidth: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
                  <Text style={[styles.heroMetricLabel, { color: uiTokens.colors.textSecondary }]}>UOM / UNIT</Text>
                  <Text style={[styles.heroMetricValue, { fontSize: 16 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                    {itemUnit || "Each"}
                  </Text>
                </View>
              </View>
            </View>

            {refreshMetaLines && (
              <View style={{ marginTop: uiTokens.spacing.sm, gap: 2 }}>
                {refreshMetaLines.map((line) => (
                  <Text
                    key={line}
                    style={{
                      fontSize: 11,
                      color: uiTokens.colors.textSecondary,
                      fontWeight: "600",
                    }}
                  >
                    {line}
                  </Text>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.heroMetricTile,
                {
                  borderColor: colorWithAlpha(
                    isBatchMode ? uiTokens.colors.warning : uiTokens.colors.accent,
                    0.3
                  ),
                  borderWidth: 1,
                  minHeight: 44,
                  justifyContent: "center",
                },
              ]}
              onPress={() => {
                setIsBatchMode((prev) => {
                  const next = !prev;
                  if (!next) {
                    setBatchQuantities({});
                    setManualBatches([]);
                  }
                  return next;
                });
              }}
              accessibilityRole="button"
              accessibilityLabel="Toggle batch count mode"
            >
              <Ionicons
                {...decorativeIconProps}
                name="layers-outline"
                size={18}
                color={isBatchMode ? uiTokens.colors.warning : uiTokens.colors.accent}
              />
              <Text
                style={[
                  styles.heroMetricLabel,
                  { color: isBatchMode ? uiTokens.colors.warning : uiTokens.colors.accent },
                ]}
              >
                {isBatchMode ? "Batch Mode ON" : "Batch Mode"}
              </Text>
            </TouchableOpacity>

            {/* Blind recount warning — shown when previous count must stay hidden */}
            {blindRecountRequired && (
              <View style={[
                styles.recountBanner,
                {
                  backgroundColor: colorWithAlpha(uiTokens.colors.warning, 0.12),
                  borderColor: colorWithAlpha(uiTokens.colors.warning, 0.35),
                },
              ]}>
                <Ionicons {...decorativeIconProps} name="eye-off-outline" size={16} color={uiTokens.colors.warning} />
                <Text style={[styles.recountBannerText, { color: uiTokens.colors.warning }]}>
                  {recountBlockedReason
                    ? `Recount blocked: ${recountBlockedReason}`
                    : "Blind recount active — previous count is hidden."}
                </Text>
              </View>
            )}
          </ModernCard>

          {/* ── Count Quantity (primary action — first after item identity) ── */}
          {!isBatchMode && (
            <>
              <SectionHeading icon="calculator-outline" label="Count Quantity" uiTokens={uiTokens} decorativeIconProps={decorativeIconProps} />
              <MemoizedCountQuantitySection
                isSplitMode={isSplitMode}
                isWeightBasedUOM={isWeightBasedUOM}
                quantity={quantity}
                splitCounts={splitCounts}
                uomLabel={uomInfo.label}
                uomUnit={uomInfo.unit}
                onAddSplitCount={handleAddSplitCount}
                onClearSplitCounts={handleClearSplitCounts}
                onDecrement={handleDecrement}
                onIncrement={handleIncrement}
                onQuantityBlur={handleQuantityBlur}
                onQuantityChange={handleQuantityChange}
                onRemoveSplitCount={handleRemoveSplitCount}
                onSplitCountBlur={handleSplitCountBlur}
                onSplitCountChange={handleSplitCountChange}
                onToggleSplitMode={handleToggleSplitMode}
              />

              {/* ── MRP Validation (affects count line, so near count) ── */}
              <SectionHeading icon="cash-outline" label="Price Validation" uiTokens={uiTokens} decorativeIconProps={decorativeIconProps} />
              <MemoizedItemMrpSection
                mrp={mrp}
                mrpEditable={mrpEditable}
                mrpVariants={mrpVariants}
                onMrpChange={setMrp}
                onSelectMrpVariant={handleSelectMrpVariant}
                onToggleMrpEditable={setMrpEditable}
                selectedMrpVariant={selectedMrpVariant}
                showMrp={settings.columnVisibility.mrp}
                systemMrp={item.mrp}
              />

              {/* ── Dates ── */}
              <SectionHeading icon="calendar-clear-outline" label="Date Fields" uiTokens={uiTokens} decorativeIconProps={decorativeIconProps} />
              <MemoizedItemDateFieldsSection
                expiryDateField={expiryDateField}
                hasExpiryDate={hasExpiryDate}
                hasMfgDate={hasMfgDate}
                itemExpiryDate={itemExpiryDate}
                itemExpiryDateFormat={itemExpiryDateFormat}
                itemMfgDate={itemMfgDate}
                itemMfgDateFormat={itemMfgDateFormat}
                mfgDateField={mfgDateField}
                showExpiryDate={settings.columnVisibility.expiryDate}
                showMfgDate={settings.columnVisibility.mfgDate}
                toggleExpiryDateEnabled={toggleExpiryDateEnabled}
                toggleMfgDateEnabled={toggleMfgDateEnabled}
              />

              {/* ── Serial Tracking ── */}
              <SectionHeading icon="qr-code-outline" label="Serial Tracking" uiTokens={uiTokens} decorativeIconProps={decorativeIconProps} />
              <MemoizedSerializedItemSection
                enabled={settings.columnVisibility.serialNumber}
                isSerializedItem={isSerializedItem}
                serialEntries={serialEntries}
                serialValidationErrors={serialValidationErrors}
                serialValidationMessages={serialValidationMessages}
                onAddSerial={handleAddSerial}
                onOpenScanner={() => setShowSerialScanner(true)}
                onRemoveSerial={handleRemoveSerial}
                onSerialChange={(index, text) => handleSerialChange(index, "serial_number", text)}
                onSerialBlur={handleSerialBlur}
                onSerializedChange={setIsSerializedItem}
              />

              {/* ── Batch Variants (optional) ── */}
              {shouldShowBatchVariants && (
                <>
                  <SectionHeading icon="layers-outline" label="Batch Variants" uiTokens={uiTokens} decorativeIconProps={decorativeIconProps} />
                  <MemoizedBatchVariantsSection
                    variants={sameNameVariants}
                    rawVariantsCount={rawVariantsCount}
                    loading={batchLoading}
                    error={batchError}
                    showZeroStock={showZeroStock}
                    onToggleShowZeroStock={setShowZeroStock}
                    onSelectVariant={handleSelectVariant}
                    isBatchMode={isBatchMode}
                    batchQuantities={batchQuantities}
                    onBatchQuantityChange={handleBatchQuantityChange}
                  />
                </>
              )}

              {isBatchMode && (
                <View style={{ marginTop: uiTokens.spacing.lg }}>
                  <SectionHeading icon="add-circle-outline" label="Manual Batch Entry" uiTokens={uiTokens} decorativeIconProps={decorativeIconProps} />
                  {manualBatches.map((batch, index) => (
                    <ManualBatchEntry
                      key={batch.id}
                      batch={batch}
                      index={index}
                      uiTokens={uiTokens}
                      onFieldChange={handleBatchFieldChange}
                      onRemove={handleRemoveBatch}
                    />
                  ))}
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", gap: uiTokens.spacing.xs, marginTop: uiTokens.spacing.sm }}
                    onPress={handleAddBatch}
                  >
                    <Ionicons {...decorativeIconProps} name="add-circle-outline" size={18} color={uiTokens.colors.accent} />
                    <Text style={{ color: uiTokens.colors.accent, fontWeight: "600", fontSize: 13 }}>Add Manual Batch</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ── Evidence & Notes (last before submit) ── */}
              <SectionHeading icon="document-text-outline" label="Evidence & Notes" uiTokens={uiTokens} decorativeIconProps={decorativeIconProps} />
              <MemoizedEvidenceNotesSection
                damagePhoto={damagePhoto}
                damageQty={damageQty}
                damageType={damageType}
                isDamageEnabled={isDamageEnabled}
                itemPhotos={itemPhotos}
                remark={remark}
                varianceRemark={varianceRemark}
                onAddItemPhoto={handleAddItemPhoto}
                onDamageQtyChange={setDamageQty}
                onDamageToggle={setIsDamageEnabled}
                onDamageTypeChange={setDamageType}
                onRemarkChange={setRemark}
                onRemoveDamagePhoto={removeDamagePhoto}
                onRemoveItemPhoto={removeItemPhoto}
                onTakeDamagePhoto={handleTakeDamagePhoto}
                onVarianceRemarkChange={setVarianceRemark}
              />
            </>
          )}

        </ScrollView>
          canSubmit={canSubmit}
          submitting={submitting}
          submitCountdown={submitCountdown}
          onCancelSubmit={cancelSubmit}
          onSubmitAndScanNext={handleSubmitAndScanNext}
          onSubmitAndStay={handleSubmitAndStay}
        />
      </KeyboardAvoidingView>

      <ItemDetailModals
        defaultMrp={parseFloat(mrp) || item?.mrp}
        existingSerials={serialEntries.map((e) => e.serial_number)}
        expiryDateField={expiryDateField}
        itemName={item?.item_name || item?.name}
        itemBarcode={item?.barcode || displayBarcode}
        itemCode={item?.item_code}
        mfgDateField={mfgDateField}
        onCloseSerialScanner={() => setShowSerialScanner(false)}
        onSerialScanned={handleSerialScanned}
        serialScannerVisible={showSerialScanner}
      />

      <PhotoCaptureModal
        visible={photoCaptureVisible}
        title={photoCaptureTitle}
        onClose={closePhotoCapture}
        onCapture={handlePhotoCaptured}
      />
    </ThemedScreen>
  );
}
