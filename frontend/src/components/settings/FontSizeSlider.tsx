/**
 * FontSizeSlider - Accessible font size adjustment component
 * Allows users to customize their preferred font size for better readability
 */

import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import Slider from "@react-native-community/slider";
import { selectionAsync } from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useTheme } from "../../hooks/useTheme";

interface FontSizeSliderProps {
  value: number;
  onValueChange: (value: number) => void;
  minValue?: number;
  maxValue?: number;
  step?: number;
  disabled?: boolean;
}

const FONT_SIZE_LABELS: Record<number, string> = {
  12: "Extra Small",
  14: "Small",
  16: "Medium",
  18: "Large",
  20: "Extra Large",
  22: "Huge",
};

export const FontSizeSlider: React.FC<FontSizeSliderProps> = ({
  value,
  onValueChange,
  minValue = 12,
  maxValue = 22,
  step = 2,
  disabled = false,
}) => {
  const { colors, typography, spacing, borderRadius } = useTheme();

  const handleValueChange = (newValue: number) => {
    // Snap to step values
    const snappedValue = Math.round(newValue / step) * step;

    // Only trigger haptics and callback when value actually changes
    if (snappedValue !== value) {
      if (Platform.OS !== "web") {
        selectionAsync();
      }
      onValueChange(snappedValue);
    }
  };

  const getSizeLabel = (): string => {
    return FONT_SIZE_LABELS[value] || `${value}pt`;
  };

  return (
    <View style={[styles.container, disabled && styles.disabledContainer]}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Ionicons
            name="text-outline"
            size={18}
            color={disabled ? colors.textTertiary : colors.text}
          />
          <Text
            style={[
              styles.label,
              { color: colors.text, fontSize: typography.fontSize.md },
              disabled && { color: colors.textTertiary },
            ]}
          >
            Font Size
          </Text>
        </View>
        <Text
          style={[
            styles.valueLabel,
            { color: colors.accent || colors.primary },
            disabled && { color: colors.textTertiary },
          ]}
        >
          {getSizeLabel()}
        </Text>
      </View>

      <View style={styles.sliderContainer}>
        <Text style={[styles.minMaxLabel, { color: colors.textSecondary, fontSize: minValue }]}>
          A
        </Text>

        <Slider
          style={styles.slider}
          value={value}
          onValueChange={handleValueChange}
          minimumValue={minValue}
          maximumValue={maxValue}
          step={step}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.accent || colors.primary}
          disabled={disabled}
        />

        <Text style={[styles.minMaxLabel, { color: colors.textSecondary, fontSize: maxValue }]}>
          A
        </Text>
      </View>

      {/* Preview Text */}
      <View
        style={[
          styles.previewContainer,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: borderRadius.md,
            padding: spacing.sm,
          },
        ]}
      >
        <Text
          style={[
            styles.previewText,
            {
              color: colors.text,
              fontFamily: typography.fontFamily.body,
              fontSize: value,
            },
            disabled && { color: colors.textTertiary },
          ]}
        >
          Sample Text Preview
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 8,
  },
  disabledContainer: {
    opacity: 0.5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  label: {
    fontWeight: "500",
  },
  valueLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  sliderContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  minMaxLabel: {
    fontWeight: "600",
    width: 28,
    textAlign: "center",
  },
  previewContainer: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewText: {
    textAlign: "center",
  },
});

export default FontSizeSlider;
