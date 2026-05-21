/**
 * Modern Item Detail Screen - Lavanya Mart Stock Verify
 * Clean, efficient item verification interface
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  InteractionManager,
  ActivityIndicator,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useScanSessionStore } from "@/store/scanSessionStore";
import { useSettingsStore } from "@/store/settingsStore";

import ModernHeader from "@/components/ui/ModernHeader";
import ModernButton from "@/components/ui/ModernButton";
import ModernCard from "@/components/ui/ModernCard";
import { ThemedScreen } from "@/components/ui/ThemedScreen";
import { BatchVariantsSection, getBatchVariantKey } from "@/components/scan/BatchVariantsSection";
import { CountQuantitySection } from "@/components/scan/CountQuantitySection";
import { EvidenceNotesSection } from "@/components/scan/EvidenceNotesSection";
import { ItemDateFieldsSection } from "@/components/scan/ItemDateFieldsSection";
import { ItemDetailModals } from "@/components/scan/ItemDetailModals";
import { ItemMrpSection } from "@/components/scan/ItemMrpSection";
import { ItemSubmitBar } from "@/components/scan/ItemSubmitBar";
import { SerializedItemSection } from "@/components/scan/SerializedItemSection";
import { PhotoCaptureModal } from "@/components/modals/PhotoCaptureModal";
import { OperationalSyncBanner } from "@/components/feedback/OperationalSyncBanner";
import { useDeferredItemSubmission } from "@/domains/inventory/hooks/scan/useDeferredItemSubmission";
import { useItemDraftAutosave } from "@/domains/inventory/hooks/scan/useItemDraftAutosave";
import { useItemDetailData } from "@/domains/inventory/hooks/scan/useItemDetailData";
import { useItemEvidenceState } from "@/domains/inventory/hooks/scan/useItemEvidenceState";
import { useItemMetadataState } from "@/domains/inventory/hooks/scan/useItemMetadataState";
import { useQuantityCountManager } from "@/domains/inventory/hooks/scan/useQuantityCountManager";
import { useSerialEntryManager } from "@/domains/inventory/hooks/scan/useSerialEntryManager";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { CountLineBatch } from "@/types/scan";
import { getDecorativeIconProps } from "@/utils/accessibility";
import { safeBackNavigation } from "@/utils/navigation";

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

const formatBatchCountQuantity = (value: string | number, precision: number): string => {
  const numericValue = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(numericValue)) return "0";
  if (precision > 0) return numericValue.toFixed(precision).replace(/\.?0+$/, "") || "0";
  return Math.floor(numericValue).toString();
};

const isValidBatchCountInput = (value: string, precision: number): boolean => {
  if (value === "" || value === "." || value === "0.") return true;
  if (precision > 0) {
    const safePrecision = Math.min(Math.max(0, precision), 10);
    return new RegExp(`^\\d*\\.?\\d{0,${safePrecision}}$`).test(value);
  }
  return /^\d*$/.test(value);
};

const getBatchIdentity = (variant: any): string =>
  String(variant.batch_id || variant.batch_no || variant.batch_number || variant.barcode || "");

export default function ItemDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const uiTokens = useUiTokens();
  const decorativeIconProps = getDecorativeIconProps();
  const params = useLocalSearchParams<{ barcode: string; sessionId: string }>();
  const { barcode, sessionId } = params;
  const displayBarcode = Array.isArray(barcode) ? barcode[0] : barcode;
  const normalizedSessionId = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  const { currentFloor, currentRack } = useScanSessionStore();
  const { settings } = useSettingsStore();

  // Form State
  const [quantity, setQuantity] = useState("0");
  const [batchCounts, setBatchCounts] = useState<Record<string, string>>({});
  const [batchCountMode, setBatchCountMode] = useState(false);
  const [mrp, setMrp] = useState("");
  const [condition] = useState("Good");
  const styles = useMemo(() => {
    return StyleSheet.create({
      loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: uiTokens.spacing.lg,
      },
      loadingText: {
        marginTop: uiTokens.spacing.sm,
        color: uiTokens.colors.textSecondary,
        fontSize: 14,
      },
      errorContainer: {
        flex: 1,
        justifyContent: "center",
        paddingHorizontal: uiTokens.spacing.lg,
        gap: uiTokens.spacing.md,
      },
      errorCard: {
        gap: uiTokens.spacing.sm,
      },
      errorTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: uiTokens.colors.textPrimary,
        textAlign: "center",
      },
      errorText: {
        fontSize: 14,
        color: uiTokens.colors.textSecondary,
        textAlign: "center",
      },
      keyboardView: {
        flex: 1,
      },
      scrollContent: {
        paddingHorizontal: uiTokens.spacing.md,
        paddingTop: uiTokens.spacing.md,
        paddingBottom: uiTokens.spacing.xl,
        gap: uiTokens.spacing.md,
        flexGrow: 1,
      },
      heroCard: {
        borderWidth: 1,
        borderColor: colorWithAlpha(uiTokens.colors.accent, uiTokens.mode === "dark" ? 0.36 : 0.2),
        backgroundColor: uiTokens.colors.surfaceElevated,
      },
      heroTop: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: uiTokens.spacing.md,
      },
      heroIcon: {
        width: 56,
        height: 56,
        borderRadius: uiTokens.radius.md,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colorWithAlpha(
          uiTokens.colors.accent,
          uiTokens.mode === "dark" ? 0.24 : 0.1
        ),
      },
      heroCopy: {
        flex: 1,
        minWidth: 0,
      },
      heroEyebrow: {
        fontSize: 12,
        fontWeight: "800",
        color: uiTokens.colors.textSecondary,
        textTransform: "uppercase",
      },
      heroTitle: {
        color: uiTokens.colors.textPrimary,
        fontSize: 22,
        fontWeight: "800",
        lineHeight: 27,
        marginTop: uiTokens.spacing.xs,
      },
      heroCodeRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: uiTokens.spacing.xs,
        marginTop: uiTokens.spacing.sm,
      },
      heroPill: {
        alignItems: "center",
        borderColor: uiTokens.colors.border,
        borderRadius: uiTokens.radius.md,
        borderWidth: 1,
        flexDirection: "row",
        gap: uiTokens.spacing.xs,
        paddingHorizontal: uiTokens.spacing.sm,
        paddingVertical: uiTokens.spacing.xs,
        backgroundColor: uiTokens.colors.surface,
      },
      heroPillStrong: {
        borderColor: colorWithAlpha(uiTokens.colors.accent, 0.36),
        backgroundColor: colorWithAlpha(
          uiTokens.colors.accent,
          uiTokens.mode === "dark" ? 0.16 : 0.08
        ),
      },
      heroPillText: {
        color: uiTokens.colors.textSecondary,
        fontSize: 12,
        fontWeight: "700",
      },
      heroPillTextStrong: {
        color: uiTokens.colors.accentStrong,
      },
      sourcePill: {
        alignSelf: "flex-start",
        borderRadius: uiTokens.radius.md,
        borderWidth: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: uiTokens.spacing.xs,
        paddingHorizontal: uiTokens.spacing.sm,
        paddingVertical: uiTokens.spacing.xs,
      },
      sourcePillText: {
        fontSize: 11,
        fontWeight: "800",
        textTransform: "uppercase",
      },
      heroMetrics: {
        borderTopWidth: 1,
        borderTopColor: uiTokens.colors.border,
        flexDirection: "row",
        gap: uiTokens.spacing.sm,
        marginTop: uiTokens.spacing.md,
        paddingTop: uiTokens.spacing.md,
      },
      heroMetricTile: {
        flex: 1,
        borderWidth: 1,
        borderColor: uiTokens.colors.border,
        borderRadius: uiTokens.radius.md,
        backgroundColor: uiTokens.colors.surface,
        paddingHorizontal: uiTokens.spacing.xs,
        paddingVertical: uiTokens.spacing.sm,
      },
      heroMetricLabel: {
        color: uiTokens.colors.textSecondary,
        fontSize: 11,
        fontWeight: "700",
        textTransform: "uppercase",
      },
      heroMetricValue: {
        color: uiTokens.colors.textPrimary,
        fontSize: 16,
        fontWeight: "800",
        marginTop: 2,
      },
      heroContextChips: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: uiTokens.spacing.xs,
        marginTop: uiTokens.spacing.md,
      },
      heroContextChip: {
        alignItems: "center",
        borderRadius: uiTokens.radius.md,
        borderWidth: 1,
        borderColor: uiTokens.colors.border,
        flexDirection: "row",
        gap: uiTokens.spacing.xs,
        backgroundColor: uiTokens.colors.surface,
        paddingHorizontal: uiTokens.spacing.sm,
        paddingVertical: uiTokens.spacing.xs,
      },
      heroContextChipText: {
        fontSize: 12,
        color: uiTokens.colors.textSecondary,
        fontWeight: "700",
      },
      workflowStrip: {
        flexDirection: "row",
        gap: uiTokens.spacing.xs,
        marginTop: uiTokens.spacing.md,
      },
      workflowStep: {
        flex: 1,
        borderRadius: uiTokens.radius.md,
        borderWidth: 1,
        borderColor: colorWithAlpha(uiTokens.colors.accent, 0.24),
        backgroundColor: colorWithAlpha(
          uiTokens.colors.accent,
          uiTokens.mode === "dark" ? 0.12 : 0.06
        ),
        paddingHorizontal: uiTokens.spacing.xs,
        paddingVertical: uiTokens.spacing.sm,
      },
      workflowStepIcon: {
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        borderRadius: uiTokens.radius.full,
        backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.16),
        marginBottom: uiTokens.spacing.xs,
      },
      workflowStepText: {
        color: uiTokens.colors.textPrimary,
        fontSize: 12,
        fontWeight: "800",
      },
      workflowStepMeta: {
        color: uiTokens.colors.textSecondary,
        fontSize: 11,
        fontWeight: "600",
        marginTop: 2,
      },
      sectionHeading: {
        flexDirection: "row",
        alignItems: "center",
        gap: uiTokens.spacing.xs,
        marginTop: uiTokens.spacing.xs,
      },
      sectionHeadingText: {
        fontSize: 12,
        fontWeight: "700",
        color: uiTokens.colors.textSecondary,
        textTransform: "uppercase",
      },
      syncBanner: {
        marginBottom: uiTokens.spacing.xs,
      },
      submitSpacer: {
        height: Math.max(96, insets.bottom + 88),
      },
    });
  }, [insets.bottom, uiTokens]);

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
    batchCountVariants,
    batchLoading,
    handleSelectMrpVariant,
    item,
    loading,
    mrpVariants,
    rawVariantsCount,
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
  const batchVariantRows = useMemo(
    () => (batchCountVariants.length > 0 ? batchCountVariants : sameNameVariants),
    [batchCountVariants, sameNameVariants]
  );
  const hasBatchCountEntries = useMemo(
    () => Object.values(batchCounts).some((value) => value.trim().length > 0),
    [batchCounts]
  );
  const batchCountTotal = useMemo(
    () =>
      batchVariantRows.reduce((total, variant, index) => {
        const key = getBatchVariantKey(variant, index);
        return total + (Number.parseFloat(batchCounts[key] || "0") || 0);
      }, 0),
    [batchVariantRows, batchCounts]
  );
  const batchCountTotalLabel = useMemo(
    () => formatBatchCountQuantity(batchCountTotal, uomInfo.precision),
    [batchCountTotal, uomInfo.precision]
  );
  const canEnableBatchCount = !isSplitMode && (batchVariantRows.length > 1 || rawVariantsCount > 1);
  const batchCountPayload = useMemo<CountLineBatch[]>(
    () =>
      batchVariantRows
        .map((variant, index) => {
          const batchVariant = variant as any;
          const key = getBatchVariantKey(variant, index);
          const countedQuantity = Number.parseFloat(batchCounts[key] || "0") || 0;
          const batchId = getBatchIdentity(variant) || key;
          return {
            batch_id: batchId,
            batch_no: batchVariant.batch_no || batchId,
            batch_number: batchVariant.batch_number || batchVariant.batch_no || batchId,
            barcode: batchVariant.barcode,
            item_code: batchVariant.item_code,
            item_name: batchVariant.item_name || batchVariant.name,
            quantity: countedQuantity,
            mrp: typeof batchVariant.mrp === "number" ? batchVariant.mrp : undefined,
            manufacturing_date: batchVariant.manufacturing_date,
            expiry_date: batchVariant.expiry_date,
            item_condition: condition,
            stock_qty: batchVariant.stock_qty ?? batchVariant.current_stock,
          };
        })
        .filter((batch) => batch.quantity > 0),
    [batchVariantRows, batchCounts, condition]
  );
  const clearBatchCountMode = useCallback(() => {
    setBatchCountMode((enabled) => (enabled ? false : enabled));
    setBatchCounts((previous) => (Object.keys(previous).length > 0 ? {} : previous));
  }, []);
  const handleManualQuantityChange = useCallback(
    (value: string) => {
      clearBatchCountMode();
      handleQuantityChange(value);
    },
    [clearBatchCountMode, handleQuantityChange]
  );
  const handleManualDecrement = useCallback(() => {
    clearBatchCountMode();
    handleDecrement();
  }, [clearBatchCountMode, handleDecrement]);
  const handleManualIncrement = useCallback(() => {
    clearBatchCountMode();
    handleIncrement();
  }, [clearBatchCountMode, handleIncrement]);
  const handleManualToggleSplitMode = useCallback(() => {
    clearBatchCountMode();
    handleToggleSplitMode();
  }, [clearBatchCountMode, handleToggleSplitMode]);
  const handleManualAddSplitCount = useCallback(() => {
    clearBatchCountMode();
    handleAddSplitCount();
  }, [clearBatchCountMode, handleAddSplitCount]);
  const handleManualClearSplitCounts = useCallback(() => {
    clearBatchCountMode();
    handleClearSplitCounts();
  }, [clearBatchCountMode, handleClearSplitCounts]);
  const handleManualRemoveSplitCount = useCallback(
    (index: number) => {
      clearBatchCountMode();
      handleRemoveSplitCount(index);
    },
    [clearBatchCountMode, handleRemoveSplitCount]
  );
  const handleManualSplitCountChange = useCallback(
    (index: number, value: string) => {
      clearBatchCountMode();
      handleSplitCountChange(index, value);
    },
    [clearBatchCountMode, handleSplitCountChange]
  );
  const handleToggleBatchCountMode = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        setBatchCountMode(false);
        setBatchCounts({});
        return;
      }

      if (!canEnableBatchCount) return;
      if (isSplitMode) handleToggleSplitMode();
      setBatchCountMode(true);
      setQuantity(batchCountTotalLabel);
    },
    [batchCountTotalLabel, canEnableBatchCount, handleToggleSplitMode, isSplitMode, setQuantity]
  );
  const handleBatchCountChange = useCallback(
    (key: string, value: string) => {
      if (!isValidBatchCountInput(value, uomInfo.precision)) return;
      setBatchCounts((previous) => ({ ...previous, [key]: value }));
    },
    [uomInfo.precision]
  );
  const handleBatchCountBlur = useCallback(
    (key: string) => {
      setBatchCounts((previous) => {
        const value = previous[key] || "";
        return {
          ...previous,
          [key]:
            value === "" || value === "." || value === "0."
              ? "0"
              : formatBatchCountQuantity(value, uomInfo.precision),
        };
      });
    },
    [uomInfo.precision]
  );
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

  const [isInteractionsComplete, setIsInteractionsComplete] = useState(false);
  const {
    handleAddSerial,
    handleRemoveSerial,
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
    const task = InteractionManager.runAfterInteractions(() => {
      setIsInteractionsComplete(true);
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    const itemResetKey = item?.barcode || item?.item_code;
    if (!itemResetKey) return;
    resetSerialState();
    resetQuantityState();
    resetEvidenceState();
    resetMetadataState();
    setBatchCountMode(false);
    setBatchCounts({});
  }, [
    item?.barcode,
    item?.item_code,
    resetEvidenceState,
    resetMetadataState,
    resetQuantityState,
    resetSerialState,
  ]);

  useEffect(() => {
    if (!batchCountMode || !hasBatchCountEntries) return;
    setQuantity(batchCountTotalLabel);
  }, [batchCountMode, batchCountTotalLabel, hasBatchCountEntries, setQuantity]);

  const { submitting, submitCountdown, handleSubmitPress, cancelSubmit } =
    useDeferredItemSubmission({
      barcode: displayBarcode,
      sessionId: normalizedSessionId,
      currentFloor,
      currentRack,
      item,
      quantity,
      batches: batchCountMode && batchCountPayload.length > 0 ? batchCountPayload : undefined,
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
      onSuccess: handleBackPress,
    });
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
  const sourceStatus =
    item._source === "cache"
      ? {
          label: "Cached",
          icon: "cloud-offline-outline" as const,
          color: uiTokens.colors.warning,
        }
      : item._source === "sql"
        ? {
            label: "ERP live",
            icon: "checkmark-circle-outline" as const,
            color: uiTokens.colors.success,
          }
        : {
            label: "Ready",
            icon: "shield-checkmark-outline" as const,
            color: uiTokens.colors.info,
          };
  const heroStockValue = formatStockMetric(itemStock, itemUnit, settings.showItemStock);
  const heroMrpValue = formatPriceMetric(
    item.mrp,
    settings.showItemPrices && settings.columnVisibility.mrp
  );
  const heroSessionValue = normalizedSessionId
    ? normalizedSessionId.slice(-8).toUpperCase()
    : "N/A";
  const parsedQuantity = Number.parseFloat(quantity);
  const canSubmit = Number.isFinite(parsedQuantity) && parsedQuantity > 0;
  const shouldShowBatchVariants =
    batchLoading ||
    Boolean(batchError) ||
    rawVariantsCount > 0 ||
    sameNameVariants.length > 0 ||
    batchVariantRows.length > 0;

  return (
    <ThemedScreen showPattern={false} variant="solid" dismissKeyboardOnTap>
      <ModernHeader
        title="Verify Item"
        subtitle={item.item_name || item.name}
        showBackButton
        onBackPress={handleBackPress}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
          bounces
          alwaysBounceVertical
          removeClippedSubviews={settings.lazyLoading}
        >
          {settings.offlineMode ? (
            <OperationalSyncBanner
              compact
              tone="offline"
              title="Offline item verification"
              message="This item is using cached inventory data. Save will queue locally and sync when a live connection is available."
              style={styles.syncBanner}
            />
          ) : null}

          <ModernCard style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <Ionicons
                  {...decorativeIconProps}
                  name="cube-outline"
                  size={28}
                  color={uiTokens.colors.accentStrong}
                />
              </View>

              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>Item verification</Text>
                <Text
                  style={styles.heroTitle}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {itemName}
                </Text>

                <View style={styles.heroCodeRow}>
                  <View style={[styles.heroPill, styles.heroPillStrong]}>
                    <Ionicons
                      {...decorativeIconProps}
                      name="barcode-outline"
                      size={13}
                      color={uiTokens.colors.accentStrong}
                    />
                    <Text
                      style={[styles.heroPillText, styles.heroPillTextStrong]}
                      numberOfLines={1}
                    >
                      {displayBarcode || "N/A"}
                    </Text>
                  </View>

                  <View style={styles.heroPill}>
                    <Ionicons
                      {...decorativeIconProps}
                      name="pricetag-outline"
                      size={13}
                      color={uiTokens.colors.textSecondary}
                    />
                    <Text style={styles.heroPillText} numberOfLines={1}>
                      {itemCode}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.sourcePill,
                      {
                        backgroundColor: colorWithAlpha(
                          sourceStatus.color,
                          uiTokens.mode === "dark" ? 0.2 : 0.1
                        ),
                        borderColor: colorWithAlpha(sourceStatus.color, 0.36),
                      },
                    ]}
                  >
                    <Ionicons
                      {...decorativeIconProps}
                      name={sourceStatus.icon}
                      size={13}
                      color={sourceStatus.color}
                    />
                    <Text style={[styles.sourcePillText, { color: sourceStatus.color }]}>
                      {sourceStatus.label}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.heroMetrics}>
              <View style={styles.heroMetricTile}>
                <Text style={styles.heroMetricLabel}>System stock</Text>
                <Text
                  style={styles.heroMetricValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.68}
                >
                  {heroStockValue}
                </Text>
              </View>

              <View style={styles.heroMetricTile}>
                <Text style={styles.heroMetricLabel}>MRP</Text>
                <Text
                  style={styles.heroMetricValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.68}
                >
                  {heroMrpValue}
                </Text>
              </View>

              <View style={styles.heroMetricTile}>
                <Text style={styles.heroMetricLabel}>Unit</Text>
                <Text
                  style={styles.heroMetricValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.68}
                >
                  {itemUnit || "Each"}
                </Text>
              </View>
            </View>

            <View style={styles.heroContextChips}>
              <View style={styles.heroContextChip}>
                <Ionicons
                  {...decorativeIconProps}
                  name="file-tray-stacked-outline"
                  size={13}
                  color={uiTokens.colors.textSecondary}
                />
                <Text style={styles.heroContextChipText}>Session {heroSessionValue}</Text>
              </View>
              <View style={styles.heroContextChip}>
                <Ionicons
                  {...decorativeIconProps}
                  name="layers-outline"
                  size={13}
                  color={uiTokens.colors.textSecondary}
                />
                <Text style={styles.heroContextChipText}>Floor {currentFloor || "N/A"}</Text>
              </View>
              <View style={styles.heroContextChip}>
                <Ionicons
                  {...decorativeIconProps}
                  name="cube-outline"
                  size={13}
                  color={uiTokens.colors.textSecondary}
                />
                <Text style={styles.heroContextChipText}>Rack {currentRack || "N/A"}</Text>
              </View>
            </View>

            <View style={styles.workflowStrip} accessibilityLabel="Item verification workflow">
              <View style={styles.workflowStep}>
                <View style={styles.workflowStepIcon}>
                  <Ionicons
                    {...decorativeIconProps}
                    name="scan-outline"
                    size={14}
                    color={uiTokens.colors.accentStrong}
                  />
                </View>
                <Text style={styles.workflowStepText}>Identify</Text>
                <Text style={styles.workflowStepMeta}>Locked item</Text>
              </View>

              <View style={styles.workflowStep}>
                <View style={styles.workflowStepIcon}>
                  <Ionicons
                    {...decorativeIconProps}
                    name="calculator-outline"
                    size={14}
                    color={uiTokens.colors.accentStrong}
                  />
                </View>
                <Text style={styles.workflowStepText}>Count</Text>
                <Text style={styles.workflowStepMeta}>Enter qty</Text>
              </View>

              <View style={styles.workflowStep}>
                <View style={styles.workflowStepIcon}>
                  <Ionicons
                    {...decorativeIconProps}
                    name="checkmark-done-outline"
                    size={14}
                    color={uiTokens.colors.accentStrong}
                  />
                </View>
                <Text style={styles.workflowStepText}>Save</Text>
                <Text style={styles.workflowStepMeta}>Audit line</Text>
              </View>
            </View>
          </ModernCard>

          {isInteractionsComplete && (
            <>
              <View style={styles.sectionHeading}>
                <Ionicons
                  {...decorativeIconProps}
                  name="calculator-outline"
                  size={16}
                  color={uiTokens.colors.textSecondary}
                />
                <Text style={styles.sectionHeadingText}>Count Quantity</Text>
              </View>
              <View>
                <CountQuantitySection
                  isSplitMode={isSplitMode}
                  isQuantityLocked={batchCountMode}
                  isWeightBasedUOM={isWeightBasedUOM}
                  quantity={quantity}
                  quantityLockHint="Total is calculated from batch counts."
                  quantityLockLabel="Batch Total"
                  splitCounts={splitCounts}
                  uomLabel={uomInfo.label}
                  uomUnit={uomInfo.unit}
                  onAddSplitCount={handleManualAddSplitCount}
                  onClearSplitCounts={handleManualClearSplitCounts}
                  onDecrement={handleManualDecrement}
                  onIncrement={handleManualIncrement}
                  onQuantityBlur={handleQuantityBlur}
                  onQuantityChange={handleManualQuantityChange}
                  onRemoveSplitCount={handleManualRemoveSplitCount}
                  onSplitCountBlur={handleSplitCountBlur}
                  onSplitCountChange={handleManualSplitCountChange}
                  onToggleSplitMode={handleManualToggleSplitMode}
                />
              </View>
            </>
          )}

          {isInteractionsComplete && (
            <>
              {shouldShowBatchVariants ? (
                <>
                  <View style={styles.sectionHeading}>
                    <Ionicons
                      {...decorativeIconProps}
                      name="layers-outline"
                      size={16}
                      color={uiTokens.colors.textSecondary}
                    />
                    <Text style={styles.sectionHeadingText}>Batch Variants</Text>
                  </View>
                  <BatchVariantsSection
                    variants={batchVariantRows}
                    rawVariantsCount={rawVariantsCount}
                    loading={batchLoading}
                    error={batchError}
                    showZeroStock={showZeroStock}
                    activeBarcode={displayBarcode}
                    batchCountEnabled={batchCountMode}
                    batchCountTotal={batchCountTotalLabel}
                    canEnableBatchCount={canEnableBatchCount}
                    countValues={batchCounts}
                    isWeightBasedUOM={isWeightBasedUOM}
                    onBatchCountBlur={
                      batchCountMode && !isSplitMode ? handleBatchCountBlur : undefined
                    }
                    onBatchCountChange={
                      batchCountMode && !isSplitMode ? handleBatchCountChange : undefined
                    }
                    onToggleBatchCountEnabled={handleToggleBatchCountMode}
                    onToggleShowZeroStock={setShowZeroStock}
                    onSelectVariant={(variantBarcode) => {
                      router.replace({
                        pathname: "/staff/item-detail",
                        params: normalizedSessionId
                          ? { barcode: variantBarcode, sessionId: normalizedSessionId }
                          : { barcode: variantBarcode },
                      });
                    }}
                    uomUnit={uomInfo.unit}
                  />
                </>
              ) : null}

              <View style={styles.sectionHeading}>
                <Ionicons
                  {...decorativeIconProps}
                  name="calendar-clear-outline"
                  size={16}
                  color={uiTokens.colors.textSecondary}
                />
                <Text style={styles.sectionHeadingText}>Date Fields</Text>
              </View>
              <ItemDateFieldsSection
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

              <View style={styles.sectionHeading}>
                <Ionicons
                  {...decorativeIconProps}
                  name="barcode-outline"
                  size={16}
                  color={uiTokens.colors.textSecondary}
                />
                <Text style={styles.sectionHeadingText}>Serial Tracking</Text>
              </View>
              <SerializedItemSection
                enabled={settings.columnVisibility.serialNumber}
                isSerializedItem={isSerializedItem}
                serialEntries={serialEntries}
                serialValidationErrors={serialValidationErrors}
                serialValidationMessages={serialValidationMessages}
                onAddSerial={handleAddSerial}
                onOpenScanner={() => setShowSerialScanner(true)}
                onRemoveSerial={handleRemoveSerial}
                onSerialChange={(index, text) => handleSerialChange(index, "serial_number", text)}
                onSerializedChange={setIsSerializedItem}
              />

              <View style={styles.sectionHeading}>
                <Ionicons
                  {...decorativeIconProps}
                  name="cash-outline"
                  size={16}
                  color={uiTokens.colors.textSecondary}
                />
                <Text style={styles.sectionHeadingText}>Price Validation</Text>
              </View>
              <ItemMrpSection
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

              <View style={styles.sectionHeading}>
                <Ionicons
                  {...decorativeIconProps}
                  name="document-text-outline"
                  size={16}
                  color={uiTokens.colors.textSecondary}
                />
                <Text style={styles.sectionHeadingText}>Evidence & Notes</Text>
              </View>
              <EvidenceNotesSection
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

          <View style={styles.submitSpacer} />
        </ScrollView>

        <ItemSubmitBar
          canSubmit={canSubmit}
          submitting={submitting}
          submitCountdown={submitCountdown}
          onCancelSubmit={cancelSubmit}
          onSubmit={handleSubmitPress}
        />
      </KeyboardAvoidingView>

      <ItemDetailModals
        defaultMrp={parseFloat(mrp) || item?.mrp}
        existingSerials={serialEntries.map((e) => e.serial_number)}
        expiryDateField={expiryDateField}
        itemName={item?.item_name || item?.name}
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
