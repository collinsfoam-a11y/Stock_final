import React from "react";
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import ModernCard from "@/components/ui/ModernCard";
import { getStockQty } from "@/utils/itemBatchUtils";
import {
  colors,
  fontSize,
  fontWeight,
  radius as borderRadius,
  semanticColors,
  spacing,
} from "@/theme/unified";

const SURFACE_CARD = "#ffffff";
const SURFACE_BORDER = "#d9e5e2";
const SURFACE_MUTED = "#f8fafc";
const ACCENT = "#0f766e";
const TEXT_STRONG = "#0f172a";
const TEXT_MUTED = "#475569";

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
  if (variants.length === 0 && rawVariantsCount === 0) {
    return null;
  }

  return (
    <ModernCard style={styles.sectionCard} contentStyle={styles.sectionCardContent}>
      <View style={styles.header}>
        <Text style={styles.title}>Batches</Text>
        {loading && <ActivityIndicator size="small" color={colors.primary[600]} />}
        <View style={styles.toggle}>
          <Text style={styles.toggleLabel}>Include 0 stock</Text>
          <Switch
            value={showZeroStock}
            onValueChange={onToggleShowZeroStock}
            trackColor={{
              true: colors.primary[600],
              false: colors.neutral[200],
            }}
            thumbColor={colors.white}
            style={styles.toggleSwitch}
          />
        </View>
      </View>

      {variants.length === 0 ? (
        <Text
          style={[
            styles.emptyText,
            {
              color: error ? colors.warning[700] : semanticColors.text.secondary,
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
            const variantKey =
              variant._id ??
              [variant.item_code, variant.barcode, variant.batch_no, `idx-${index}`]
                .filter((value) => value !== undefined && value !== null && value !== "")
                .join(":");

            return (
              <TouchableOpacity
                key={variantKey}
                onPress={() => onSelectVariant(variant.barcode)}
                activeOpacity={0.7}
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
                    <View style={styles.stock}>
                      <Text style={styles.stockValue}>{stockQty}</Text>
                      <Text style={styles.stockLabel}>Stock</Text>
                    </View>
                  </View>
                </ModernCard>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ModernCard>
  );
};

const styles = StyleSheet.create({
  sectionCard: {
    marginTop: spacing.md,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: SURFACE_CARD,
  },
  sectionCardContent: {
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semiBold,
    color: TEXT_STRONG,
    flex: 1,
  },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: "auto",
  },
  toggleLabel: {
    fontSize: fontSize.sm,
    color: TEXT_MUTED,
    marginRight: spacing.xs,
  },
  toggleSwitch: {
    marginLeft: spacing.xs,
  },
  emptyText: {
    fontSize: fontSize.sm,
  },
  list: {
    gap: spacing.sm,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: SURFACE_MUTED,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  info: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  batchTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semiBold,
    color: TEXT_STRONG,
  },
  batchMrp: {
    fontSize: fontSize.sm,
    color: TEXT_MUTED,
  },
  meta: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: TEXT_MUTED,
  },
  stock: {
    alignItems: "flex-end",
  },
  stockValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: ACCENT,
  },
  stockLabel: {
    fontSize: fontSize.xs,
    color: semanticColors.text.secondary,
  },
});
