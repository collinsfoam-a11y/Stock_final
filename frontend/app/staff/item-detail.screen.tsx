/**
 * Modern Item Detail Screen - Lavanya Mart Stock Verify
 * Clean, efficient item verification interface
 */

import { useState, useEffect, useCallback } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useScanSessionStore } from "@/store/scanSessionStore";
import { useSettingsStore } from "@/store/settingsStore";

import ModernHeader from "@/components/ui/ModernHeader";
import ModernButton from "@/components/ui/ModernButton";
import { ThemedScreen } from "@/components/ui/ThemedScreen";
import { BatchVariantsSection } from "@/components/scan/BatchVariantsSection";
import { CountQuantitySection } from "@/components/scan/CountQuantitySection";
import { EvidenceNotesSection } from "@/components/scan/EvidenceNotesSection";
import { ItemDateFieldsSection } from "@/components/scan/ItemDateFieldsSection";
import { ItemDetailModals } from "@/components/scan/ItemDetailModals";
import { ItemMrpSection } from "@/components/scan/ItemMrpSection";
import { ItemSubmitBar } from "@/components/scan/ItemSubmitBar";
import { ItemSummarySection } from "@/components/scan/ItemSummarySection";
import { SerializedItemSection } from "@/components/scan/SerializedItemSection";
import { PhotoCaptureModal } from "@/components/modals/PhotoCaptureModal";
import { useDeferredItemSubmission } from "@/domains/inventory/hooks/scan/useDeferredItemSubmission";
import { useItemDraftAutosave } from "@/domains/inventory/hooks/scan/useItemDraftAutosave";
import { useItemDetailData } from "@/domains/inventory/hooks/scan/useItemDetailData";
import { useItemEvidenceState } from "@/domains/inventory/hooks/scan/useItemEvidenceState";
import { useItemMetadataState } from "@/domains/inventory/hooks/scan/useItemMetadataState";
import { useQuantityCountManager } from "@/domains/inventory/hooks/scan/useQuantityCountManager";
import { useSerialEntryManager } from "@/domains/inventory/hooks/scan/useSerialEntryManager";
import {
  colors,
  semanticColors,
  spacing,
  fontSize,
  fontWeight,
} from "@/theme/unified";

export default function ItemDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ barcode: string; sessionId: string }>();
  const { barcode, sessionId } = params;
  const normalizedSessionId = Array.isArray(sessionId)
    ? sessionId[0]
    : sessionId;
  const { currentFloor, currentRack } = useScanSessionStore();
  const { settings } = useSettingsStore();

  // Form State
  const [quantity, setQuantity] = useState("0");
  const [mrp, setMrp] = useState("");
  const [condition] = useState("Good");

  const handleBackPress = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    if (normalizedSessionId) {
      router.replace({
        pathname: "/staff/scan",
        params: { sessionId: normalizedSessionId },
      });
      return;
    }

    router.replace("/staff/home");
  }, [normalizedSessionId, router]);

  const {
    batchError,
    batchLoading,
    handleRefreshStock,
    handleSelectMrpVariant,
    isRefreshing,
    item,
    loading,
    mrpVariants,
    rawVariantsCount,
    sameNameVariants,
    selectedMrpVariant,
    setShowZeroStock,
    showZeroStock,
  } = useItemDetailData({
    barcode,
    sessionId,
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
    sessionId,
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
      barcode,
      sessionId,
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
      onSuccess: handleBackPress,
    });
  useItemDraftAutosave({
    currentFloor,
    currentRack,
    item,
    mrp,
    quantity,
    remark,
    sessionId,
    submitting,
  });

  // Sync quantity with serial entries count for serialized items
  if (loading) {
    return (
      <ThemedScreen>
        <ModernHeader
          title="Verify Item"
          showBackButton
          onBackPress={handleBackPress}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={{ marginTop: 12, color: semanticColors.text.secondary }}>
            Loading item details...
          </Text>
        </View>
      </ThemedScreen>
    );
  }

  if (!item) {
    return (
      <ThemedScreen>
        <ModernHeader
          title="Verify Item"
          showBackButton
          onBackPress={handleBackPress}
        />
        <View style={styles.errorContainer}>
          <Ionicons
            name="alert-circle-outline"
            size={64}
            color={colors.error[500]}
          />
          <Text style={styles.errorTitle}>Item Not Found</Text>
          <Text style={styles.errorText}>
            We couldn't retrieve details for the scanned barcode.
          </Text>
          <ModernButton
            title="Try Again"
            onPress={handleBackPress}
            style={{ marginTop: 24, width: "100%" }}
          />
        </View>
      </ThemedScreen>
    );
  }

  return (
    <ThemedScreen>
      <ModernHeader
        title="Verify Item"
        showBackButton
        onBackPress={handleBackPress}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
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
          <ItemSummarySection
            barcode={Array.isArray(barcode) ? barcode[0] : barcode}
            isRefreshing={isRefreshing}
            item={item}
            onRefreshStock={handleRefreshStock}
            showDetails={isInteractionsComplete}
            showItemImages={settings.showItemImages}
            showItemPrices={settings.showItemPrices}
            showItemStock={settings.showItemStock}
          />

          {isInteractionsComplete && (
            <>
              {/* Quantity Input - PRIMARY SECTION */}
              <View style={styles.section}>
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
              </View>

              {/* Batches */}
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
                    params: { barcode: variantBarcode, sessionId },
                  });
                }}
              />

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

              <SerializedItemSection
                enabled={settings.columnVisibility.serialNumber}
                isSerializedItem={isSerializedItem}
                serialEntries={serialEntries}
                serialValidationErrors={serialValidationErrors}
                serialValidationMessages={serialValidationMessages}
                onAddSerial={handleAddSerial}
                onOpenScanner={() => setShowSerialScanner(true)}
                onRemoveSerial={handleRemoveSerial}
                onSerialChange={(index, text) =>
                  handleSerialChange(index, "serial_number", text)
                }
                onSerializedChange={setIsSerializedItem}
              />

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

          <View style={styles.footerSpacer} />
        </ScrollView>

        <ItemSubmitBar
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

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
  },
  errorTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.neutral[900],
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.neutral[600],
    textAlign: "center",
  },
  scrollContent: {
    padding: spacing.md,
    flexGrow: 1,
  },
  section: {
    marginBottom: spacing.xl,
  },
  footerSpacer: {
    height: 80,
  },
});
