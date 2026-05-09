/**
 * MRPVariantSelector Component
 * Displays MRP variants and allows selection
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { NormalizedMrpVariant } from "@/types/scan";
import { MRP_MATCH_TOLERANCE } from "@/constants/scanConstants";

import { semanticColors, colors } from "@/theme/legacyCompat";
interface MRPVariantSelectorProps {
  variants: NormalizedMrpVariant[];
  currentMrp: number | null;
  parsedMrpValue: number | null;
  onVariantSelect: (variant: NormalizedMrpVariant) => void;
  mrpDifference?: number | null;
  mrpChangePercent?: number | null;
  systemMrp?: number | null;
}

export const MRPVariantSelector: React.FC<MRPVariantSelectorProps> = ({
  variants,
  currentMrp: _currentMrp,
  parsedMrpValue,
  onVariantSelect,
  mrpDifference = null,
  mrpChangePercent = null,
  systemMrp = null,
}) => {
  if (variants.length === 0) {
    return null;
  }

  return (
    <>
      <View style={styles.mrpVariantsContainer}>
        <Text style={styles.mrpVariantsLabel}>Known MRP Values</Text>
        <View style={styles.mrpVariantsChips}>
          {variants.map((variant) => {
            const isSelected =
              parsedMrpValue !== null &&
              Math.abs(variant.value - parsedMrpValue) < MRP_MATCH_TOLERANCE;
            const variantString = variant.value.toFixed(2);
            return (
              <TouchableOpacity
                key={`mrp-variant-${variant.id ?? variant.barcode ?? variantString}`}
                style={[styles.mrpVariantChip, isSelected && styles.mrpVariantChipActive]}
                onPress={() => onVariantSelect(variant)}
              >
                <Text
                  style={[styles.mrpVariantChipText, isSelected && styles.mrpVariantChipTextActive]}
                >
                  ₹{variantString}
                </Text>
                {(variant.label || variant.source) && (
                  <Text
                    style={[
                      styles.mrpVariantChipMeta,
                      isSelected && styles.mrpVariantChipMetaActive,
                    ]}
                    numberOfLines={1}
                  >
                    {variant.label ?? variant.source}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {mrpDifference !== null &&
        parsedMrpValue !== null &&
        Math.abs(mrpDifference) > 0.0001 &&
        systemMrp !== null && (
          <View style={styles.mrpChangeBox}>
            <Text style={styles.mrpChangeLabel}>MRP Change:</Text>
            <Text
              style={[
                styles.mrpChangeValue,
                mrpDifference > 0
                  ? styles.mrpIncrease
                  : mrpDifference < 0
                    ? styles.mrpDecrease
                    : styles.mrpNeutral,
              ]}
            >
              {`₹${systemMrp.toFixed(2)} → ₹${parsedMrpValue.toFixed(2)} (${mrpDifference > 0 ? "+" : ""}${mrpDifference.toFixed(2)}${mrpChangePercent !== null ? ` • ${mrpChangePercent > 0 ? "+" : ""}${mrpChangePercent.toFixed(1)}%` : ""})`}
            </Text>
            <Text style={styles.mrpChangeNotice}>
              MRP change will be submitted only when the value differs.
            </Text>
          </View>
        )}
    </>
  );
};

const styles = StyleSheet.create({
  mrpVariantsContainer: {
    marginTop: 16,
    marginBottom: 16,
  },
  mrpVariantsLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: semanticColors.text.tertiary,
    marginBottom: 12,
  },
  mrpVariantsChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mrpVariantChip: {
    backgroundColor: colors.neutral[800],
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.neutral[700],
    minWidth: 80,
    alignItems: "center",
  },
  mrpVariantChipActive: {
    backgroundColor: colors.success[900],
    borderColor: colors.info[500],
  },
  mrpVariantChipText: {
    color: semanticColors.text.inverse,
    fontSize: 16,
    fontWeight: "600",
  },
  mrpVariantChipTextActive: {
    color: colors.info[500],
  },
  mrpVariantChipMeta: {
    color: colors.neutral[400],
    fontSize: 11,
    marginTop: 2,
  },
  mrpVariantChipMetaActive: {
    color: colors.info[500],
  },
  mrpChangeBox: {
    backgroundColor: colors.neutral[800],
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.info[500],
  },
  mrpChangeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.neutral[400],
    marginBottom: 8,
  },
  mrpChangeValue: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  mrpIncrease: {
    color: colors.success[500],
  },
  mrpDecrease: {
    color: colors.error[500],
  },
  mrpNeutral: {
    color: semanticColors.text.inverse,
  },
  mrpChangeNotice: {
    fontSize: 12,
    color: colors.neutral[400],
    fontStyle: "italic",
    marginTop: 4,
  },
});
