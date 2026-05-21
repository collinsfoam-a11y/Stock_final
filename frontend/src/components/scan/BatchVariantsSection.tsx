import React, { useMemo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ModernCard from "@/components/ui/ModernCard";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getStockQty } from "@/utils/itemBatchUtils";
import { OPERATIONAL_HIT_SLOP } from "@/utils/accessibility";

interface BatchVariantsSectionProps {
  variants: any[];
  rawVariantsCount: number;
  loading: boolean;
  error: string | null;
  showZeroStock: boolean;
  activeBarcode?: string;
  batchCountEnabled?: boolean;
  batchCountTotal?: string;
  canEnableBatchCount?: boolean;
  countValues?: Record<string, string>;
  isWeightBasedUOM?: boolean;
  onBatchCountBlur?: (key: string) => void;
  onBatchCountChange?: (key: string, value: string) => void;
  onToggleBatchCountEnabled?: (value: boolean) => void;
  onToggleShowZeroStock: (value: boolean) => void;
  onSelectVariant: (barcode: string) => void;
  uomUnit?: string;
}

export const getBatchVariantKey = (variant: any, index: number): string =>
  (
    variant._id ||
    variant.barcode ||
    variant.batch_id ||
    variant.batch_no ||
    [variant.item_code, `idx-${index}`].filter(Boolean).join(":")
  ).toString();

export const BatchVariantsSection: React.FC<BatchVariantsSectionProps> = ({
  variants,
  rawVariantsCount,
  loading,
  error,
  showZeroStock,
  activeBarcode,
  batchCountEnabled = false,
  batchCountTotal = "0",
  canEnableBatchCount = true,
  countValues,
  isWeightBasedUOM = false,
  onBatchCountBlur,
  onBatchCountChange,
  onToggleBatchCountEnabled,
  onToggleShowZeroStock,
  onSelectVariant,
  uomUnit,
}) => {
  const uiTokens = useUiTokens();
  const batchCountToggleVisible = Boolean(onToggleBatchCountEnabled);
  const batchCountToggleDisabled = loading || (!batchCountEnabled && !canEnableBatchCount);
  const visibleCountLabel =
    rawVariantsCount > 0 && variants.length !== rawVariantsCount
      ? `${variants.length}/${rawVariantsCount}`
      : String(variants.length || rawVariantsCount);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        section: {
          marginBottom: uiTokens.spacing.md,
        },
        header: {
          flexDirection: "row",
          alignItems: "center",
          gap: uiTokens.spacing.sm,
          marginBottom: uiTokens.spacing.sm,
        },
        headerTitle: {
          flex: 1,
          gap: uiTokens.spacing.xs,
          minWidth: 0,
        },
        titleLine: {
          alignItems: "center",
          flexDirection: "row",
          gap: uiTokens.spacing.xs,
        },
        title: {
          fontSize: 14,
          fontWeight: "700",
          color: uiTokens.colors.textSecondary,
          letterSpacing: 0.2,
          textTransform: "uppercase",
        },
        titleBadge: {
          backgroundColor: uiTokens.colors.surface,
          borderColor: uiTokens.colors.border,
          borderRadius: uiTokens.radius.sm,
          borderWidth: 1,
          paddingHorizontal: uiTokens.spacing.xs,
          paddingVertical: uiTokens.spacing.xxs,
        },
        titleBadgeText: {
          color: uiTokens.colors.textSecondary,
          fontSize: 11,
          fontWeight: "800",
        },
        controls: {
          alignItems: "center",
          flexDirection: "row",
          flexWrap: "wrap",
          gap: uiTokens.spacing.sm,
          justifyContent: "space-between",
          marginBottom: uiTokens.spacing.sm,
        },
        toggle: {
          flexDirection: "row",
          alignItems: "center",
          minHeight: 44,
        },
        toggleLabel: {
          fontSize: 12,
          color: uiTokens.colors.textSecondary,
          marginRight: uiTokens.spacing.xs,
          fontWeight: "700",
        },
        toggleSwitch: {
          marginLeft: uiTokens.spacing.xs,
        },
        countSummary: {
          alignItems: "center",
          backgroundColor: colorWithAlpha(
            uiTokens.colors.info,
            uiTokens.mode === "dark" ? 0.18 : 0.08
          ),
          borderColor: colorWithAlpha(uiTokens.colors.info, 0.32),
          borderRadius: uiTokens.radius.md,
          borderWidth: 1,
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: uiTokens.spacing.sm,
          minHeight: 44,
          paddingHorizontal: uiTokens.spacing.sm,
          paddingVertical: uiTokens.spacing.xs,
        },
        countSummaryLabel: {
          color: uiTokens.colors.textSecondary,
          fontSize: 12,
          fontWeight: "800",
          textTransform: "uppercase",
        },
        countSummaryValue: {
          color: uiTokens.colors.info,
          fontSize: 17,
          fontWeight: "900",
        },
        emptyText: {
          fontSize: 13,
          color: uiTokens.colors.textSecondary,
        },
        list: {
          gap: uiTokens.spacing.sm,
        },
        card: {
          borderRadius: uiTokens.radius.lg,
          borderWidth: 1,
          borderColor: uiTokens.colors.border,
          backgroundColor: uiTokens.colors.surfaceElevated,
        },
        cardContent: {
          gap: uiTokens.spacing.sm,
        },
        row: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: uiTokens.spacing.md,
        },
        info: {
          flex: 1,
          justifyContent: "center",
          minHeight: 44,
        },
        titleRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: uiTokens.spacing.sm,
        },
        batchIdentity: {
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: uiTokens.spacing.sm,
          minWidth: 0,
        },
        batchTitle: {
          fontSize: 13,
          fontWeight: "700",
          color: uiTokens.colors.textPrimary,
          flexShrink: 1,
        },
        batchMrp: {
          fontSize: 12,
          color: uiTokens.colors.textSecondary,
          fontWeight: "600",
          flexShrink: 0,
        },
        currentBadge: {
          backgroundColor: colorWithAlpha(
            uiTokens.colors.info,
            uiTokens.mode === "dark" ? 0.22 : 0.1
          ),
          borderColor: colorWithAlpha(uiTokens.colors.info, 0.34),
          borderRadius: uiTokens.radius.sm,
          borderWidth: 1,
          paddingHorizontal: uiTokens.spacing.xs,
          paddingVertical: uiTokens.spacing.xxs,
        },
        currentBadgeText: {
          color: uiTokens.colors.info,
          fontSize: 10,
          fontWeight: "800",
          textTransform: "uppercase",
        },
        meta: {
          marginTop: uiTokens.spacing.xs,
          fontSize: 12,
          color: uiTokens.colors.textSecondary,
        },
        stock: {
          alignItems: "center",
          justifyContent: "center",
          minWidth: 62,
          borderRadius: uiTokens.radius.md,
          borderWidth: 1,
          paddingHorizontal: uiTokens.spacing.sm,
          paddingVertical: uiTokens.spacing.xs,
        },
        stockValue: {
          fontSize: 17,
          fontWeight: "800",
        },
        stockLabel: {
          fontSize: 11,
          color: uiTokens.colors.textSecondary,
          fontWeight: "600",
          textTransform: "uppercase",
        },
        countRow: {
          alignItems: "center",
          backgroundColor: uiTokens.colors.surface,
          borderColor: uiTokens.colors.border,
          borderRadius: uiTokens.radius.md,
          borderWidth: 1,
          flexDirection: "row",
          gap: uiTokens.spacing.sm,
          minHeight: 48,
          minWidth: 0,
          paddingHorizontal: uiTokens.spacing.sm,
          paddingVertical: uiTokens.spacing.xs,
        },
        countLabel: {
          color: uiTokens.colors.textSecondary,
          fontSize: 12,
          fontWeight: "800",
          textTransform: "uppercase",
          width: 64,
        },
        countInput: {
          color: uiTokens.colors.textPrimary,
          flex: 1,
          fontSize: 20,
          fontWeight: "800",
          minHeight: 40,
          minWidth: 0,
          paddingHorizontal: uiTokens.spacing.sm,
          paddingVertical: uiTokens.spacing.xs,
          textAlign: "right",
        },
      }),
    [uiTokens]
  );

  if (variants.length === 0 && rawVariantsCount === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <View style={styles.titleLine}>
            <Text style={styles.title}>Batches</Text>
            <View style={styles.titleBadge}>
              <Text style={styles.titleBadgeText}>{visibleCountLabel}</Text>
            </View>
          </View>
        </View>
        {loading && <ActivityIndicator size="small" color={uiTokens.colors.accent} />}
      </View>

      <View style={styles.controls}>
        {batchCountToggleVisible ? (
          <View style={styles.toggle}>
            <Text
              style={[
                styles.toggleLabel,
                {
                  color: batchCountToggleDisabled
                    ? uiTokens.colors.textMuted
                    : uiTokens.colors.textSecondary,
                },
              ]}
            >
              Batch count
            </Text>
            <Switch
              value={batchCountEnabled}
              disabled={batchCountToggleDisabled}
              onValueChange={(value) => onToggleBatchCountEnabled?.(value)}
              accessibilityLabel="Enable batch count entry"
              accessibilityState={{
                disabled: batchCountToggleDisabled,
                checked: batchCountEnabled,
              }}
              trackColor={{
                true: uiTokens.colors.accent,
                false: colorWithAlpha(
                  uiTokens.colors.textMuted,
                  uiTokens.mode === "dark" ? 0.45 : 0.28
                ),
              }}
              thumbColor={
                batchCountEnabled ? uiTokens.colors.surfaceElevated : uiTokens.colors.surface
              }
              style={styles.toggleSwitch}
            />
          </View>
        ) : null}
        <View style={styles.toggle}>
          <Text style={styles.toggleLabel}>Include 0 stock</Text>
          <Switch
            value={showZeroStock}
            onValueChange={onToggleShowZeroStock}
            accessibilityLabel="Show zero stock batches"
            accessibilityState={{ checked: showZeroStock }}
            trackColor={{
              true: uiTokens.colors.accent,
              false: colorWithAlpha(
                uiTokens.colors.textMuted,
                uiTokens.mode === "dark" ? 0.45 : 0.28
              ),
            }}
            thumbColor={showZeroStock ? uiTokens.colors.surfaceElevated : uiTokens.colors.surface}
            style={styles.toggleSwitch}
          />
        </View>
      </View>

      {batchCountEnabled ? (
        <View style={styles.countSummary}>
          <Text style={styles.countSummaryLabel}>Batch total</Text>
          <Text style={styles.countSummaryValue} numberOfLines={1} adjustsFontSizeToFit>
            {batchCountTotal}
            {uomUnit ? ` ${uomUnit}` : ""}
          </Text>
        </View>
      ) : null}

      {variants.length === 0 ? (
        <Text
          style={[
            styles.emptyText,
            {
              color: error ? uiTokens.colors.warning : uiTokens.colors.textSecondary,
            },
          ]}
        >
          {error || (showZeroStock ? "No batches found." : "No batches with stock.")}
        </Text>
      ) : (
        <View style={styles.list}>
          {variants.map((variant, index) => {
            const stockQty = getStockQty(variant);
            const batchTitle = variant.batch_no || variant.item_code || "N/A";
            const numericMrp = Number.parseFloat(String(variant.mrp ?? ""));
            const mrpDisplay = Number.isFinite(numericMrp) ? numericMrp.toFixed(2) : "-";
            const barcodeText = variant.barcode || "-";
            const isOutOfStock = stockQty <= 0;
            const isCurrent =
              Boolean(activeBarcode && variant.barcode) &&
              String(variant.barcode).trim() === String(activeBarcode).trim();
            const canSelect = Boolean(variant.barcode) && !isCurrent;
            const variantKey = getBatchVariantKey(variant, index);
            const canEditCount = batchCountEnabled && Boolean(onBatchCountChange);

            return (
              <ModernCard key={variantKey} style={styles.card}>
                <View style={styles.cardContent}>
                  <View style={styles.row}>
                    <TouchableOpacity
                      style={styles.info}
                      accessibilityRole="button"
                      accessibilityLabel={`Select batch ${batchTitle}, barcode ${barcodeText}`}
                      accessibilityState={{
                        disabled: !canSelect,
                        selected: isCurrent,
                      }}
                      hitSlop={OPERATIONAL_HIT_SLOP.standard}
                      onPress={() => onSelectVariant(variant.barcode)}
                      activeOpacity={0.8}
                      disabled={!canSelect}
                    >
                      <View style={styles.titleRow}>
                        <View style={styles.batchIdentity}>
                          <Text style={styles.batchTitle} numberOfLines={1}>
                            Batch {batchTitle}
                          </Text>
                          {isCurrent ? (
                            <View style={styles.currentBadge}>
                              <Text style={styles.currentBadgeText}>Current</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.batchMrp} numberOfLines={1}>
                          MRP Rs.{mrpDisplay}
                        </Text>
                      </View>
                      <Text style={styles.meta} numberOfLines={1}>
                        Barcode: {barcodeText}
                      </Text>
                    </TouchableOpacity>
                    <View
                      style={[
                        styles.stock,
                        {
                          borderColor: isOutOfStock
                            ? colorWithAlpha(uiTokens.colors.warning, 0.45)
                            : colorWithAlpha(uiTokens.colors.success, 0.45),
                          backgroundColor: isOutOfStock
                            ? colorWithAlpha(
                                uiTokens.colors.warning,
                                uiTokens.mode === "dark" ? 0.2 : 0.12
                              )
                            : colorWithAlpha(
                                uiTokens.colors.success,
                                uiTokens.mode === "dark" ? 0.2 : 0.12
                              ),
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.stockValue,
                          {
                            color: isOutOfStock ? uiTokens.colors.warning : uiTokens.colors.success,
                          },
                        ]}
                      >
                        {stockQty}
                      </Text>
                      <Text style={styles.stockLabel}>Stock</Text>
                    </View>
                  </View>

                  {canEditCount ? (
                    <View style={styles.countRow}>
                      <Text style={styles.countLabel}>Count</Text>
                      <TextInput
                        style={styles.countInput}
                        value={countValues?.[variantKey] ?? ""}
                        onChangeText={(value) => onBatchCountChange?.(variantKey, value)}
                        onBlur={() => onBatchCountBlur?.(variantKey)}
                        keyboardType={isWeightBasedUOM ? "decimal-pad" : "number-pad"}
                        placeholder="0"
                        placeholderTextColor={uiTokens.colors.textMuted}
                        selectTextOnFocus
                        accessibilityLabel={`Count for batch ${batchTitle}`}
                      />
                    </View>
                  ) : null}
                </View>
              </ModernCard>
            );
          })}
        </View>
      )}
    </View>
  );
};
