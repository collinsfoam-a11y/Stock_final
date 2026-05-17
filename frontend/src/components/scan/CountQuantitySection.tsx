import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import {
  COMFORTABLE_TOUCH_TARGET,
  getAccessibleButtonProps,
  getAccessibleToggleProps,
  getDecorativeIconProps,
  getMinimumTouchTargetStyle,
  OPERATIONAL_HIT_SLOP,
} from "@/utils/accessibility";

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
  const uiTokens = useUiTokens();
  const decorativeIconProps = getDecorativeIconProps();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        actionRow: {
          flexDirection: "row",
          gap: uiTokens.spacing.sm,
          marginTop: uiTokens.spacing.xs,
        },
        addSplitButton: {
          alignItems: "center",
          backgroundColor: uiTokens.colors.accent,
          borderRadius: uiTokens.radius.md,
          flexDirection: "row",
          gap: uiTokens.spacing.xs,
          justifyContent: "center",
          flex: 1,
          height: 44,
        },
        addSplitButtonText: {
          color: uiTokens.colors.surfaceElevated,
          fontWeight: "700",
          fontSize: 13,
        },
        clearButton: {
          alignItems: "center",
          backgroundColor: colorWithAlpha(
            uiTokens.colors.error,
            uiTokens.mode === "dark" ? 0.2 : 0.08
          ),
          borderColor: colorWithAlpha(uiTokens.colors.error, 0.35),
          borderRadius: uiTokens.radius.md,
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
          color: uiTokens.colors.textSecondary,
          fontSize: 12,
          fontWeight: "500",
          marginBottom: uiTokens.spacing.sm,
        },
        metaRow: {
          alignItems: "center",
          flexDirection: "row",
          gap: uiTokens.spacing.xs,
        },
        modeBadge: {
          backgroundColor: colorWithAlpha(
            uiTokens.colors.accent,
            uiTokens.mode === "dark" ? 0.25 : 0.12
          ),
          borderColor: colorWithAlpha(uiTokens.colors.accent, 0.35),
          borderRadius: uiTokens.radius.sm,
          borderWidth: 1,
          paddingHorizontal: uiTokens.spacing.sm,
          paddingVertical: uiTokens.spacing.xxs,
        },
        modeBadgeText: {
          color: uiTokens.colors.accentStrong,
          fontSize: 10,
          fontWeight: "700",
          textTransform: "uppercase",
        },
        qtyButton: {
          alignItems: "center",
          borderRadius: uiTokens.radius.lg,
          height: 56,
          justifyContent: "center",
          width: 56,
        },
        qtyDisplay: {
          alignItems: "center",
          borderRadius: uiTokens.radius.lg,
          borderWidth: 2,
          flex: 1,
          height: 56,
          justifyContent: "center",
          marginHorizontal: uiTokens.spacing.sm,
        },
        qtyText: {
          fontSize: 28,
          fontWeight: "800",
          textAlign: "center",
          width: "100%",
          color: uiTokens.colors.textPrimary,
        },
        quantityContainer: {
          alignItems: "center",
          flexDirection: "row",
          marginTop: uiTokens.spacing.md,
          marginBottom: uiTokens.spacing.md,
        },
        removeButton: {
          ...getMinimumTouchTargetStyle(),
          alignItems: "center",
          justifyContent: "center",
          padding: uiTokens.spacing.sm,
        },
        sectionMeta: {
          fontSize: 13,
          fontWeight: "600",
          color: uiTokens.colors.textSecondary,
        },
        sectionTitle: {
          fontSize: 16,
          fontWeight: "700",
          color: uiTokens.colors.textPrimary,
          marginBottom: 2,
        },
        splitCountContainer: {
          backgroundColor: uiTokens.colors.surface,
          borderColor: uiTokens.colors.border,
          borderRadius: uiTokens.radius.lg,
          borderWidth: 1,
          marginTop: uiTokens.spacing.sm,
          padding: uiTokens.spacing.md,
        },
        splitIndexBadge: {
          alignItems: "center",
          backgroundColor: uiTokens.colors.surfaceElevated,
          borderRadius: uiTokens.radius.full,
          height: 32,
          justifyContent: "center",
          width: 32,
          borderWidth: 1,
          borderColor: uiTokens.colors.border,
        },
        splitIndexText: {
          color: uiTokens.colors.textSecondary,
          fontSize: 12,
          fontWeight: "700",
        },
        splitInput: {
          backgroundColor: uiTokens.colors.surface,
          borderColor: uiTokens.colors.border,
          borderRadius: uiTokens.radius.md,
          borderWidth: 1,
          color: uiTokens.colors.textPrimary,
          flex: 1,
          fontSize: 18,
          fontWeight: "700",
          marginHorizontal: uiTokens.spacing.sm,
          paddingHorizontal: uiTokens.spacing.md,
          paddingVertical: uiTokens.spacing.sm,
        },
        splitRow: {
          alignItems: "center",
          flexDirection: "row",
          marginBottom: uiTokens.spacing.sm,
        },
        toggleButton: {
          alignItems: "center",
          borderRadius: uiTokens.radius.full,
          flexDirection: "row",
          gap: uiTokens.spacing.xs,
          paddingHorizontal: uiTokens.spacing.sm + uiTokens.spacing.xxs,
          paddingVertical: uiTokens.spacing.xs + uiTokens.spacing.xxs,
          borderWidth: 1,
          minHeight: COMFORTABLE_TOUCH_TARGET,
        },
        toggleButtonText: {
          fontSize: 12,
          fontWeight: "700",
        },
      }),
    [uiTokens]
  );

  return (
    <>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.sectionTitle}>Count</Text>
          <View style={styles.metaRow}>
            <View style={styles.modeBadge}>
              <Text style={styles.modeBadgeText}>{uomLabel} Mode</Text>
            </View>
            <Text style={styles.sectionMeta}>Unit: {uomUnit}</Text>
          </View>
        </View>

        <TouchableOpacity
          {...getAccessibleToggleProps({
            label: isSplitMode ? "Switch to piece count mode" : "Switch to split count mode",
            selected: isSplitMode,
          })}
          onPress={onToggleSplitMode}
          style={[
            styles.toggleButton,
            {
              backgroundColor: isSplitMode
                ? uiTokens.colors.accent
                : colorWithAlpha(uiTokens.colors.accent, uiTokens.mode === "dark" ? 0.16 : 0.08),
              borderColor: isSplitMode
                ? uiTokens.colors.accent
                : colorWithAlpha(uiTokens.colors.accent, 0.32),
            },
          ]}
        >
          <Ionicons
            {...decorativeIconProps}
            name={isSplitMode ? "grid" : "grid-outline"}
            size={14}
            color={isSplitMode ? uiTokens.colors.surfaceElevated : uiTokens.colors.accentStrong}
          />
          <Text
            style={[
              styles.toggleButtonText,
              {
                color: isSplitMode ? uiTokens.colors.surfaceElevated : uiTokens.colors.accentStrong,
              },
            ]}
          >
            {isSplitMode ? "Piece Count" : "Split Count"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.quantityContainer}>
        <TouchableOpacity
          {...getAccessibleButtonProps({
            label: "Decrease counted quantity",
            disabled: isSplitMode,
            hitSlop: OPERATIONAL_HIT_SLOP.comfortable,
          })}
          style={[
            styles.qtyButton,
            {
              backgroundColor: isSplitMode
                ? uiTokens.colors.surface
                : uiTokens.colors.surfaceElevated,
              borderWidth: 1,
              borderColor: uiTokens.colors.border,
            },
          ]}
          onPress={onDecrement}
          disabled={isSplitMode}
          activeOpacity={0.7}
        >
          <Ionicons
            {...decorativeIconProps}
            name="remove"
            size={28}
            color={isSplitMode ? uiTokens.colors.textMuted : uiTokens.colors.textPrimary}
          />
        </TouchableOpacity>

        <View
          style={[
            styles.qtyDisplay,
            {
              backgroundColor: uiTokens.colors.surface,
              borderColor: colorWithAlpha(uiTokens.colors.accent, 0.4),
            },
          ]}
        >
          <TextInput
            style={[
              styles.qtyText,
              {
                color: isSplitMode ? uiTokens.colors.accentStrong : uiTokens.colors.textPrimary,
              },
            ]}
            value={quantity}
            onChangeText={onQuantityChange}
            editable={!isSplitMode}
            onBlur={onQuantityBlur}
            keyboardType={isWeightBasedUOM ? "decimal-pad" : "number-pad"}
            selectTextOnFocus
            placeholder="0"
            placeholderTextColor={uiTokens.colors.textMuted}
            accessibilityLabel={`Counted quantity in ${uomUnit}`}
            accessibilityHint="Enter the counted quantity for this item"
          />
        </View>

        <TouchableOpacity
          {...getAccessibleButtonProps({
            label: "Increase counted quantity",
            disabled: isSplitMode,
            hitSlop: OPERATIONAL_HIT_SLOP.comfortable,
          })}
          style={[
            styles.qtyButton,
            {
              backgroundColor: isSplitMode ? uiTokens.colors.surface : uiTokens.colors.accent,
              borderWidth: 1,
              borderColor: isSplitMode ? uiTokens.colors.border : uiTokens.colors.accent,
            },
          ]}
          onPress={onIncrement}
          disabled={isSplitMode}
          activeOpacity={0.7}
        >
          <Ionicons
            {...decorativeIconProps}
            name="add"
            size={28}
            color={isSplitMode ? uiTokens.colors.textMuted : uiTokens.colors.surfaceElevated}
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
                onChangeText={(nextValue) => onSplitCountChange(index, nextValue)}
                onBlur={() => onSplitCountBlur(index)}
                keyboardType={isWeightBasedUOM ? "decimal-pad" : "number-pad"}
                placeholder="0"
                placeholderTextColor={uiTokens.colors.textMuted}
                selectTextOnFocus
                accessibilityLabel={`Split count ${index + 1}`}
              />

              <TouchableOpacity
                {...getAccessibleButtonProps({
                  label: `Remove split count ${index + 1}`,
                  hitSlop: OPERATIONAL_HIT_SLOP.standard,
                })}
                onPress={() => onRemoveSplitCount(index)}
                style={styles.removeButton}
              >
                <Ionicons
                  {...decorativeIconProps}
                  name="remove-circle"
                  size={24}
                  color={uiTokens.colors.error}
                />
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.actionRow}>
            <TouchableOpacity
              {...getAccessibleButtonProps({ label: "Add split count row" })}
              style={styles.addSplitButton}
              onPress={onAddSplitCount}
            >
              <Ionicons
                {...decorativeIconProps}
                name="add-circle"
                size={20}
                color={uiTokens.colors.surfaceElevated}
              />
              <Text style={styles.addSplitButtonText}>Add Piece</Text>
            </TouchableOpacity>

            <TouchableOpacity
              {...getAccessibleButtonProps({
                label: "Clear all split counts",
                hitSlop: OPERATIONAL_HIT_SLOP.standard,
              })}
              style={styles.clearButton}
              onPress={onClearSplitCounts}
            >
              <Ionicons
                {...decorativeIconProps}
                name="trash-outline"
                size={20}
                color={uiTokens.colors.error}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
}
