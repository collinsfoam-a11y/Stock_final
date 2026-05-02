import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  colors,
  fontWeight,
  radius as borderRadius,
  semanticColors,
  spacing,
} from "@/theme/unified";

interface CountQuantitySectionProps {
  isSplitMode: boolean;
  isWeightBasedUOM: boolean;
  quantity: string;
  splitCounts: string[];
  uomLabel: string;
  uomUnit: string;
  onAddSplitCount: () => void;
  onClearSplitCounts: () => void;
  onDecrement: () => void;
  onIncrement: () => void;
  onQuantityBlur: () => void;
  onQuantityChange: (value: string) => void;
  onRemoveSplitCount: (index: number) => void;
  onSplitCountBlur: (index: number) => void;
  onSplitCountChange: (index: number, value: string) => void;
  onToggleSplitMode: () => void;
}

export function CountQuantitySection({
  isSplitMode,
  isWeightBasedUOM,
  quantity,
  splitCounts,
  uomLabel,
  uomUnit,
  onAddSplitCount,
  onClearSplitCounts,
  onDecrement,
  onIncrement,
  onQuantityBlur,
  onQuantityChange,
  onRemoveSplitCount,
  onSplitCountBlur,
  onSplitCountChange,
  onToggleSplitMode,
}: CountQuantitySectionProps) {
  return (
    <>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text
            style={[
              styles.sectionTitle,
              { color: semanticColors.text.primary, marginBottom: 2 },
            ]}
          >
            Count
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.modeBadge}>
              <Text style={styles.modeBadgeText}>{uomLabel} Mode</Text>
            </View>
            <Text
              style={[
                styles.sectionMeta,
                { color: semanticColors.text.secondary, fontSize: 12 },
              ]}
            >
              Unit: {uomUnit}
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={onToggleSplitMode} style={styles.toggleButton}>
          <Ionicons
            name={isSplitMode ? "grid" : "grid-outline"}
            size={14}
            color={isSplitMode ? colors.white : colors.primary[600]}
          />
          <Text
            style={[
              styles.toggleButtonText,
              { color: isSplitMode ? colors.white : colors.primary[600] },
            ]}
          >
            {isSplitMode ? "Piece Count" : "Split Count"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.quantityContainer}>
        <TouchableOpacity
          style={[
            styles.qtyButton,
            {
              backgroundColor: isSplitMode
                ? colors.neutral[100]
                : colors.neutral[200],
            },
          ]}
          onPress={onDecrement}
          disabled={isSplitMode}
          activeOpacity={0.7}
        >
          <Ionicons
            name="remove"
            size={28}
            color={
              isSplitMode ? colors.neutral[300] : semanticColors.text.primary
            }
          />
        </TouchableOpacity>

        <View
          style={[
            styles.qtyDisplay,
            {
              backgroundColor: semanticColors.background.paper,
              borderColor: colors.primary[200],
            },
          ]}
        >
          <TextInput
            style={[
              styles.qtyText,
              {
                color: isSplitMode
                  ? colors.primary[700]
                  : semanticColors.text.primary,
              },
            ]}
            value={quantity}
            onChangeText={onQuantityChange}
            editable={!isSplitMode}
            onBlur={onQuantityBlur}
            keyboardType={isWeightBasedUOM ? "decimal-pad" : "number-pad"}
            selectTextOnFocus
            placeholder="0"
            placeholderTextColor={semanticColors.text.disabled}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.qtyButton,
            {
              backgroundColor: isSplitMode
                ? colors.neutral[100]
                : colors.primary[600],
            },
          ]}
          onPress={onIncrement}
          disabled={isSplitMode}
          activeOpacity={0.7}
        >
          <Ionicons
            name="add"
            size={28}
            color={isSplitMode ? colors.neutral[300] : colors.white}
          />
        </TouchableOpacity>
      </View>

      {isSplitMode && (
        <View style={styles.splitCountContainer}>
          <Text style={styles.helperText}>
            Enter individual pieces below. They will be summed automatically.
          </Text>

          {splitCounts.map((value, index) => (
            <View key={`split-count-${index}`} style={styles.splitRow}>
              <View style={styles.splitIndexBadge}>
                <Text style={styles.splitIndexText}>#{index + 1}</Text>
              </View>

              <TextInput
                style={styles.splitInput}
                value={value}
                onChangeText={(nextValue) =>
                  onSplitCountChange(index, nextValue)
                }
                onBlur={() => onSplitCountBlur(index)}
                keyboardType={isWeightBasedUOM ? "decimal-pad" : "number-pad"}
                placeholder="0"
                selectTextOnFocus
              />

              <TouchableOpacity
                onPress={() => onRemoveSplitCount(index)}
                style={styles.removeButton}
              >
                <Ionicons
                  name="remove-circle"
                  size={24}
                  color={colors.error[400]}
                />
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.addSplitButton, { flex: 1, height: 44 }]}
              onPress={onAddSplitCount}
            >
              <Ionicons name="add-circle" size={20} color={colors.white} />
              <Text style={styles.addSplitButtonText}>Add Piece</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.clearButton} onPress={onClearSplitCounts}>
              <Ionicons
                name="trash-outline"
                size={20}
                color={colors.error[500]}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  addSplitButton: {
    alignItems: "center",
    backgroundColor: colors.primary[600],
    borderRadius: borderRadius.md,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
  },
  addSplitButtonText: {
    color: colors.white,
    fontWeight: fontWeight.bold,
  },
  clearButton: {
    alignItems: "center",
    backgroundColor: colors.neutral[100],
    borderColor: colors.neutral[200],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
  },
  headerText: {
    flex: 1,
  },
  helperText: {
    color: semanticColors.text.secondary,
    fontSize: 12,
    fontWeight: "500",
    marginBottom: spacing.sm,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  modeBadge: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[100],
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  modeBadgeText: {
    color: colors.primary[700],
    fontSize: 10,
    fontWeight: fontWeight.bold,
    textTransform: "uppercase",
  },
  qtyButton: {
    alignItems: "center",
    borderRadius: borderRadius.lg,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  qtyDisplay: {
    alignItems: "center",
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    flex: 1,
    height: 56,
    justifyContent: "center",
    marginHorizontal: spacing.sm,
  },
  qtyText: {
    fontSize: 28,
    fontWeight: fontWeight.bold,
    textAlign: "center",
    width: "100%",
  },
  quantityContainer: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  removeButton: {
    padding: 8,
  },
  sectionMeta: {
    fontSize: 13,
    fontWeight: fontWeight.medium,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: fontWeight.semiBold,
  },
  splitCountContainer: {
    backgroundColor: semanticColors.background.card,
    borderColor: semanticColors.border.default,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  splitIndexBadge: {
    alignItems: "center",
    backgroundColor: colors.neutral[100],
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  splitIndexText: {
    color: colors.neutral[600],
    fontSize: 12,
    fontWeight: fontWeight.bold,
  },
  splitInput: {
    backgroundColor: semanticColors.background.paper,
    borderColor: semanticColors.border.default,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    color: semanticColors.text.primary,
    flex: 1,
    fontSize: 18,
    fontWeight: fontWeight.semiBold,
    marginHorizontal: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  splitRow: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: spacing.sm,
  },
  toggleButton: {
    alignItems: "center",
    backgroundColor: colors.neutral[100],
    borderRadius: 20,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  toggleButtonText: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
  },
});
