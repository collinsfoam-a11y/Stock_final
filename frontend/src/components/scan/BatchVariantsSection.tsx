import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import ModernCard from "@/components/ui/ModernCard";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getStockQty } from "@/utils/itemBatchUtils";

interface BatchVariantsSectionProps {
  variants: any[];
  rawVariantsCount: number;
  loading: boolean;
  error: string | null;
  showZeroStock: boolean;
  onToggleShowZeroStock: (value: boolean) => void;
  onSelectVariant: (barcode: string) => void;
}

export const BatchVariantsSection: React.FC<BatchVariantsSectionProps> = ({
  variants,
  rawVariantsCount,
  loading,
  error,
  showZeroStock,
  onToggleShowZeroStock,
  onSelectVariant,
}) => {
  const uiTokens = useUiTokens();
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
        title: {
          fontSize: 14,
          fontWeight: "700",
          color: uiTokens.colors.textSecondary,
          letterSpacing: 0.2,
          textTransform: "uppercase",
          flex: 1,
        },
        toggle: {
          flexDirection: "row",
          alignItems: "center",
          marginLeft: "auto",
        },
        toggleLabel: {
          fontSize: 12,
          color: uiTokens.colors.textSecondary,
          marginRight: uiTokens.spacing.xs,
        },
        toggleSwitch: {
          marginLeft: uiTokens.spacing.xs,
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
        row: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: uiTokens.spacing.md,
        },
        info: {
          flex: 1,
        },
        titleRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: uiTokens.spacing.sm,
        },
        batchTitle: {
          fontSize: 13,
          fontWeight: "700",
          color: uiTokens.colors.textPrimary,
        },
        batchMrp: {
          fontSize: 12,
          color: uiTokens.colors.textSecondary,
          fontWeight: "600",
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
      }),
    [uiTokens]
  );

  if (variants.length === 0 && rawVariantsCount === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Batches</Text>
        {loading && <ActivityIndicator size="small" color={uiTokens.colors.accent} />}
        <View style={styles.toggle}>
          <Text style={styles.toggleLabel}>Include 0 stock</Text>
          <Switch
            value={showZeroStock}
            onValueChange={onToggleShowZeroStock}
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

      {variants.length === 0 ? (
        <Text
          style={[
            styles.emptyText,
            {
              color: error ? uiTokens.colors.warning : uiTokens.colors.textSecondary,
            },
          ]}
        >
          {error || (showZeroStock ? "No other batches." : "No batches with stock.")}
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
            const canSelect = Boolean(variant.barcode);
            const variantKey =
              variant._id ??
              [variant.item_code, variant.barcode, variant.batch_no, `idx-${index}`]
                .filter((value) => value !== undefined && value !== null && value !== "")
                .join(":");

            return (
              <TouchableOpacity
                key={variantKey}
                onPress={() => onSelectVariant(variant.barcode)}
                activeOpacity={0.8}
                disabled={!canSelect}
              >
                <ModernCard style={styles.card}>
                  <View style={styles.row}>
                    <View style={styles.info}>
                      <View style={styles.titleRow}>
                        <Text style={styles.batchTitle}>Batch {batchTitle}</Text>
                        <Text style={styles.batchMrp}>MRP Rs.{mrpDisplay}</Text>
                      </View>
                      <Text style={styles.meta} numberOfLines={1}>
                        Barcode: {barcodeText}
                      </Text>
                    </View>
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
                </ModernCard>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};
