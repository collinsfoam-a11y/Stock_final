import React, { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Switch, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { ModernCard } from "@/components/ui/ModernCard";
import { ModernInput } from "@/components/ui/ModernInput";
import { ModernButton } from "@/components/ui/ModernButton";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getStockQty } from "@/utils/itemBatchUtils";

export interface BatchVariantData {
  barcode: string;
  mrp: string | number;
  quantity: string;
  /**
   * Client-generated stable identity, stamped when the batch is added.
   * Used to derive a retry-stable idempotency key, so two manually added
   * batches that happen to share a barcode still submit as distinct lines.
   */
  clientId?: string;
}

interface BatchVariantsSectionProps {
  variants: any[];
  rawVariantsCount: number;
  loading: boolean;
  error: string | null;
  showZeroStock: boolean;
  onToggleShowZeroStock: (value: boolean) => void;
  // Multi-batch logic
  batchCounts: Record<string, string>;
  onBatchCountChange: (barcode: string, qty: string) => void;
  newBatches: BatchVariantData[];
  onAddNewBatch: (batch: BatchVariantData) => void;
  onRemoveNewBatch: (index: number) => void;
  onNewBatchCountChange: (index: number, qty: string) => void;
}

export const BatchVariantsSection: React.FC<BatchVariantsSectionProps> = ({
  variants,
  rawVariantsCount,
  loading,
  error,
  showZeroStock,
  onToggleShowZeroStock,
  batchCounts,
  onBatchCountChange,
  newBatches,
  onAddNewBatch,
  onRemoveNewBatch,
  onNewBatchCountChange,
}) => {
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newBarcode, setNewBarcode] = useState("");
  const [newMrp, setNewMrp] = useState("");
  const [newQty, setNewQty] = useState("");

  const handleAddNewSubmit = () => {
    if (!newBarcode.trim() || !newQty.trim()) return;
    onAddNewBatch({
      barcode: newBarcode.trim(),
      mrp: newMrp.trim() || "0",
      quantity: newQty.trim(),
    });
    setNewBarcode("");
    setNewMrp("");
    setNewQty("");
    setIsAddingNew(false);
  };

  // Filter: barcode starts with 5 and is 6 digits long.
  // We'll prioritize them by just showing them. If there are any, we might still show others but flag them.
  // The requirement said "having stock with barcode start with5 of six digit".
  // For safety, we'll just show all variants, but add a special icon/style for the 5xxxxx ones.
  // Or filter them explicitly if user toggles? Let's just show all for now since that's safer,
  // but sort the 5xxxxx ones to the top.
  const sortedVariants = useMemo(() => {
    return [...variants].sort((a, b) => {
      const aIsTarget = a.barcode?.length === 6 && a.barcode.startsWith("5");
      const bIsTarget = b.barcode?.length === 6 && b.barcode.startsWith("5");
      if (aIsTarget && !bIsTarget) return -1;
      if (!aIsTarget && bIsTarget) return 1;
      return 0;
    });
  }, [variants]);

  if (variants.length === 0 && rawVariantsCount === 0 && newBatches.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Simultaneous Batch Entry</Text>
        {loading && <ActivityIndicator size="small" color={uiTokens.colors.accent} />}
        <View style={styles.toggle}>
          <Text style={styles.toggleLabel}>Include 0 stock</Text>
          <Switch
            value={showZeroStock}
            onValueChange={onToggleShowZeroStock}
            trackColor={{
              true: uiTokens.colors.accent,
              false: colorWithAlpha(uiTokens.colors.textMuted, uiTokens.mode === "dark" ? 0.45 : 0.28),
            }}
            thumbColor={showZeroStock ? uiTokens.colors.surfaceElevated : uiTokens.colors.surface}
            style={styles.toggleSwitch}
          />
        </View>
      </View>

      {variants.length === 0 && newBatches.length === 0 ? (
        <Text style={[styles.emptyText, { color: error ? uiTokens.colors.warning : uiTokens.colors.textSecondary }]}>
          {error || (showZeroStock ? "No other batches." : "No batches with stock.")}
        </Text>
      ) : (
        <View style={styles.list}>
          {/* Render Existing Variants */}
          {sortedVariants.map((variant, index) => {
            const stockQty = getStockQty(variant);
            const batchTitle = variant.batch_no || variant.item_code || "N/A";
            const numericMrp = Number.parseFloat(String(variant.mrp ?? ""));
            const mrpDisplay = Number.isFinite(numericMrp) ? numericMrp.toFixed(2) : "-";
            const barcodeText = variant.barcode || "-";
            const isOutOfStock = stockQty <= 0;
            const isTargetBarcode = barcodeText.length === 6 && barcodeText.startsWith("5");
            const variantKey = variant._id ?? `${barcodeText}-${index}`;
            const qty = batchCounts[barcodeText] || "";

            return (
              <ModernCard key={variantKey} style={[styles.card, isTargetBarcode && styles.highlightCard]}>
                <View style={styles.row}>
                  <View style={styles.info}>
                    <View style={styles.titleRow}>
                      <Text style={styles.batchTitle}>Batch {batchTitle}</Text>
                      {isTargetBarcode && <Ionicons name="star" size={12} color={uiTokens.colors.accent} />}
                      <Text style={styles.batchMrp}>MRP Rs.{mrpDisplay}</Text>
                    </View>
                    <Text style={styles.meta} numberOfLines={1}>
                      Barcode: {barcodeText}
                    </Text>
                    <View style={styles.stockBadgeContainer}>
                      <View style={[styles.stockBadge, {
                        backgroundColor: isOutOfStock 
                          ? colorWithAlpha(uiTokens.colors.warning, 0.12)
                          : colorWithAlpha(uiTokens.colors.success, 0.12)
                      }]}>
                        <Text style={[styles.stockBadgeText, {
                          color: isOutOfStock ? uiTokens.colors.warning : uiTokens.colors.success
                        }]}>
                          ERP: {stockQty}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.inputContainer}>
                    <ModernInput
                      value={qty}
                      onChangeText={(val) => onBatchCountChange(barcodeText, val)}
                      placeholder="Qty"
                      keyboardType="numeric"
                      containerStyle={{ marginBottom: 0, width: 80 }}
                      inputStyle={{ textAlign: "center" }}
                    />
                  </View>
                </View>
              </ModernCard>
            );
          })}

          {/* Render Newly Added Batches */}
          {newBatches.map((batch, index) => (
            <ModernCard key={batch.clientId ?? `new-${batch.barcode}-${index}`} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.info}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.batchTitle, { color: uiTokens.colors.accent }]}>New Batch</Text>
                    <Text style={styles.batchMrp}>MRP Rs.{batch.mrp}</Text>
                  </View>
                  <Text style={styles.meta} numberOfLines={1}>
                    Barcode: {batch.barcode}
                  </Text>
                </View>
                <View style={[styles.inputContainer, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
                  <ModernInput
                    value={batch.quantity}
                    onChangeText={(val) => onNewBatchCountChange(index, val)}
                    placeholder="Qty"
                    keyboardType="numeric"
                    containerStyle={{ marginBottom: 0, width: 70 }}
                    inputStyle={{ textAlign: "center" }}
                  />
                  <Ionicons
                    name="trash-outline"
                    size={24}
                    color={uiTokens.colors.error}
                    onPress={() => onRemoveNewBatch(index)}
                  />
                </View>
              </View>
            </ModernCard>
          ))}
        </View>
      )}

      {/* Add New Batch Form / Button */}
      <View style={styles.addNewContainer}>
        {isAddingNew ? (
          <ModernCard style={styles.addNewForm}>
            <Text style={styles.addNewTitle}>Create New Batch</Text>
            <ModernInput
              value={newBarcode}
              onChangeText={setNewBarcode}
              placeholder="Barcode"
              keyboardType="default"
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <ModernInput
                value={newMrp}
                onChangeText={setNewMrp}
                placeholder="MRP"
                keyboardType="numeric"
                containerStyle={{ flex: 1 }}
              />
              <ModernInput
                value={newQty}
                onChangeText={setNewQty}
                placeholder="Qty"
                keyboardType="numeric"
                containerStyle={{ flex: 1 }}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <ModernButton title="Cancel" variant="outline" onPress={() => setIsAddingNew(false)} style={{ flex: 1 }} />
              <ModernButton title="Add" onPress={handleAddNewSubmit} style={{ flex: 1 }} />
            </View>
          </ModernCard>
        ) : (
          <ModernButton
            title="Add New Batch"
            icon="add-circle-outline"
            variant="outline"
            onPress={() => setIsAddingNew(true)}
          />
        )}
      </View>
    </View>
  );
};

const createStyles = (uiTokens: any) => StyleSheet.create({
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
    padding: uiTokens.spacing.md,
  },
  highlightCard: {
    borderColor: colorWithAlpha(uiTokens.colors.accent, 0.5),
    backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.05),
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
  stockBadgeContainer: {
    marginTop: uiTokens.spacing.xs,
    flexDirection: "row",
  },
  stockBadge: {
    paddingHorizontal: uiTokens.spacing.sm,
    paddingVertical: 2,
    borderRadius: uiTokens.radius.sm,
  },
  stockBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  inputContainer: {
    minWidth: 80,
  },
  addNewContainer: {
    marginTop: uiTokens.spacing.md,
  },
  addNewForm: {
    padding: uiTokens.spacing.md,
    backgroundColor: uiTokens.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: uiTokens.colors.border,
    borderRadius: uiTokens.radius.lg,
  },
  addNewTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: uiTokens.colors.textPrimary,
    marginBottom: uiTokens.spacing.sm,
  },
});
