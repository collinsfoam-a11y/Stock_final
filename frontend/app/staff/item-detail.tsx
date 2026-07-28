/**
 * Modern Item Detail Screen - Lavanya Mart Stock Verify
 * Clean, efficient item verification interface
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  InteractionManager,
  ActivityIndicator,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  TouchableOpacity,
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
import { useDeferredItemSubmission } from "@/domains/inventory/hooks/scan/useDeferredItemSubmission";
import { useItemDraftAutosave } from "@/domains/inventory/hooks/scan/useItemDraftAutosave";
import { useItemDetailData } from "@/domains/inventory/hooks/scan/useItemDetailData";
import { useItemEvidenceState } from "@/domains/inventory/hooks/scan/useItemEvidenceState";
import { useItemMetadataState } from "@/domains/inventory/hooks/scan/useItemMetadataState";
import { useQuantityCountManager } from "@/domains/inventory/hooks/scan/useQuantityCountManager";
import { useSerialEntryManager } from "@/domains/inventory/hooks/scan/useSerialEntryManager";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getDecorativeIconProps } from "@/utils/accessibility";
import { safeBackNavigation } from "@/utils/navigation";
import { createItemDetailStyles } from "@/styles/screens/ItemDetail.styles";

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
function SectionHeading({
  icon,
  label,
  uiTokens,
  decorativeIconProps,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  uiTokens: ReturnType<typeof import("@/hooks/useUiTokens").useUiTokens>;
  decorativeIconProps: Record<string, unknown>;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, marginBottom: 4, paddingHorizontal: 2 }}>
      <Ionicons {...(decorativeIconProps as any)} name={icon} size={14} color={uiTokens.colors.textMuted} />
      <Text style={{ fontSize: 11, fontWeight: "700", color: uiTokens.colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </Text>
    </View>
  );
}

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
  const [mrp, setMrp] = useState("");
  const [condition] = useState("Good");
  const styles = useMemo(
    () => createItemDetailStyles(uiTokens, insets.bottom),
    [insets.bottom, uiTokens]
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
    loading,
    mrpVariants,
    rawVariantsCount,
    recountBlockedReason,
    recountTargetId,
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
  }, [
    item?.barcode,
    item?.item_code,
    resetEvidenceState,
    resetMetadataState,
    resetQuantityState,
    resetSerialState,
  ]);

  const { submitting, submitCountdown, handleSubmitPress, cancelSubmit } =
    useDeferredItemSubmission({
      barcode: displayBarcode,
      sessionId: normalizedSessionId,
      currentFloor,
      currentRack,
      item,
      quantity,
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
      // Recount controls — enforce blocking/blind-recount in the submit guard,
      // not just the visual banner.
      recountTargetId,
      blindRecountRequired,
      recountBlockedReason,
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

  // Source indicator — single source of truth (shown once in hero)
  const sourceStatus =
    item._source === "cache"
      ? { label: "Cached",   icon: "cloud-offline-outline" as const,  color: uiTokens.colors.warning }
      : item._source === "sql"
        ? { label: "ERP live", icon: "checkmark-circle-outline" as const, color: uiTokens.colors.success }
        : { label: "Live",     icon: "shield-checkmark-outline" as const, color: uiTokens.colors.info };

  const heroStockValue = formatStockMetric(itemStock, itemUnit, settings.showItemStock);
  const heroMrpValue   = formatPriceMetric(item.mrp, settings.showItemPrices && settings.columnVisibility.mrp);
  const parsedQuantity = Number.parseFloat(quantity);
  const canSubmit      = Number.isFinite(parsedQuantity) && parsedQuantity >= 0;
  const shouldShowBatchVariants =
    batchLoading || Boolean(batchError) || rawVariantsCount > 0 || sameNameVariants.length > 0;

  // Location context — compact string for subtitle
  const locationLabel = [currentFloor, currentRack].filter(Boolean).join(" › ") || "No location";

  return (
    <ThemedScreen showPattern={false} variant="solid" dismissKeyboardOnTap>
      <ModernHeader
        title={itemName}
        subtitle={locationLabel}
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

                  {/* Data source */}
                  <View style={[styles.sourcePill, { backgroundColor: colorWithAlpha(sourceStatus.color, uiTokens.mode === "dark" ? 0.2 : 0.1), borderColor: colorWithAlpha(sourceStatus.color, 0.36) }]}>
                    <Ionicons {...decorativeIconProps} name={sourceStatus.icon} size={13} color={sourceStatus.color} />
                    <Text style={[styles.sourcePillText, { color: sourceStatus.color }]}>{sourceStatus.label}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Metrics row — stock, MRP, unit + refresh action */}
            <View style={styles.heroMetrics}>
              <View style={styles.heroMetricTile}>
                <Text style={styles.heroMetricLabel}>System stock</Text>
                <Text style={styles.heroMetricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                  {heroStockValue}
                </Text>
              </View>
              <View style={styles.heroMetricTile}>
                <Text style={styles.heroMetricLabel}>MRP</Text>
                <Text style={styles.heroMetricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                  {heroMrpValue}
                </Text>
              </View>
              <View style={styles.heroMetricTile}>
                <Text style={styles.heroMetricLabel}>Unit</Text>
                <Text style={styles.heroMetricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                  {itemUnit || "Each"}
                </Text>
              </View>
              {/* Refresh stock from ERP/SQL */}
              <TouchableOpacity
                style={[
                  styles.heroMetricTile,
                  {
                    borderColor: colorWithAlpha(uiTokens.colors.accent, 0.3),
                    borderWidth: 1,
                    minHeight: 44,
                    justifyContent: "center",
                  },
                ]}
                onPress={handleRefreshStock}
                disabled={isRefreshing}
                accessibilityRole="button"
                accessibilityLabel="Refresh stock from ERP"
              >
                <Ionicons
                  {...decorativeIconProps}
                  name={isRefreshing ? "hourglass-outline" : "refresh-outline"}
                  size={18}
                  color={uiTokens.colors.accent}
                />
                <Text style={[styles.heroMetricLabel, { color: uiTokens.colors.accent }]}>
                  {isRefreshing ? "Syncing…" : "Refresh"}
                </Text>
              </TouchableOpacity>
            </View>

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
          {isInteractionsComplete && (
            <>
              <SectionHeading icon="calculator-outline" label="Count Quantity" uiTokens={uiTokens} decorativeIconProps={decorativeIconProps} />
              <CountQuantitySection
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

              {/* ── Dates ── */}
              <SectionHeading icon="calendar-clear-outline" label="Date Fields" uiTokens={uiTokens} decorativeIconProps={decorativeIconProps} />
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

              {/* ── Serial Tracking ── */}
              <SectionHeading icon="qr-code-outline" label="Serial Tracking" uiTokens={uiTokens} decorativeIconProps={decorativeIconProps} />
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

              {/* ── Batch Variants (optional) ── */}
              {shouldShowBatchVariants && (
                <>
                  <SectionHeading icon="layers-outline" label="Batch Variants" uiTokens={uiTokens} decorativeIconProps={decorativeIconProps} />
                  <BatchVariantsSection
                    variants={sameNameVariants}
                    rawVariantsCount={rawVariantsCount}
                    loading={batchLoading}
                    error={batchError}
                    showZeroStock={showZeroStock}
                    onToggleShowZeroStock={setShowZeroStock}
                    onSelectVariant={(variantBarcode) => {
                      router.replace({
                        pathname: "/staff/item-detail",
                        params: normalizedSessionId
                          ? { barcode: variantBarcode, sessionId: normalizedSessionId }
                          : { barcode: variantBarcode },
                      });
                    }}
                  />
                </>
              )}

              {/* ── Evidence & Notes (last before submit) ── */}
              <SectionHeading icon="document-text-outline" label="Evidence & Notes" uiTokens={uiTokens} decorativeIconProps={decorativeIconProps} />
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
