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

const SURFACE_CARD = "#ffffff";
const SURFACE_BORDER = "#d9e5e2";
const SURFACE_MUTED = "#f8fafc";
const ACCENT = "#0f766e";
const ACCENT_SOFT = "#ecf7f4";
const TEXT_STRONG = "#0f172a";
const TEXT_MUTED = "#475569";

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
    <View style={styles.sectionCard}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text
            style={[styles.sectionTitle, { color: TEXT_STRONG, marginBottom: 2 }]}
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
                { color: TEXT_MUTED, fontSize: 12 },
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
            color={isSplitMode ? colors.white : ACCENT}
          />
          <Text
            style={[
              styles.toggleButtonText,
              { color: isSplitMode ? colors.white : ACCENT },
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
                ? "#e2e8f0"
                : "#dfe8e5",
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
              isSplitMode ? colors.neutral[300] : TEXT_STRONG
            }
          />
        </TouchableOpacity>

        <View
          style={[
            styles.qtyDisplay,
            {
              backgroundColor: SURFACE_CARD,
              borderColor: isSplitMode ? "#cbd5e1" : "#bfe0d6",
            },
          ]}
        >
          <TextInput
            style={[
              styles.qtyText,
              {
                color: isSplitMode
                  ? ACCENT
                  : TEXT_STRONG,
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
                ? "#e2e8f0"
                : ACCENT,
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
    </View>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    padding: spacing.lg,
    backgroundColor: SURFACE_CARD,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  addSplitButton: {
    alignItems: "center",
    backgroundColor: ACCENT,
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
    backgroundColor: SURFACE_MUTED,
    borderColor: "#e2e8f0",
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
    color: TEXT_MUTED,
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
    backgroundColor: ACCENT_SOFT,
    borderColor: "#cae8df",
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  modeBadgeText: {
    color: ACCENT,
    fontSize: 10,
    fontWeight: fontWeight.bold,
    textTransform: "uppercase",
  },
  qtyButton: {
    alignItems: "center",
    borderRadius: borderRadius.lg,
    height: 60,
    justifyContent: "center",
    width: 60,
  },
  qtyDisplay: {
    alignItems: "center",
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    flex: 1,
    height: 60,
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
    backgroundColor: SURFACE_MUTED,
    borderColor: "#e2e8f0",
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  splitIndexBadge: {
    alignItems: "center",
    backgroundColor: ACCENT_SOFT,
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  splitIndexText: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: fontWeight.bold,
  },
  splitInput: {
    backgroundColor: SURFACE_CARD,
    borderColor: "#d6e3ea",
    borderRadius: borderRadius.md,
    borderWidth: 1,
    color: TEXT_STRONG,
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
    backgroundColor: ACCENT_SOFT,
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
