/**
 * FontSizeSlider - Accessible font size adjustment component
 * Allows users to customize their preferred font size for better readability
 */

import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import Slider from "@react-native-community/slider";
import { selectionAsync } from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "../../hooks/useUiTokens";
import { fontFamily, typography } from "../../theme/legacyCompat";
import { colorWithAlpha } from "../../theme/themeTokens";

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
  const uiTokens = useUiTokens();
  const labelColor = disabled ? uiTokens.colors.textMuted : uiTokens.colors.textPrimary;
  const secondaryTextColor = disabled ? uiTokens.colors.textMuted : uiTokens.colors.textSecondary;
  const accentColor = disabled ? uiTokens.colors.textMuted : uiTokens.colors.accent;
  const previewBackground = colorWithAlpha(
    uiTokens.colors.accent,
    uiTokens.mode === "dark" ? 0.16 : 0.08
  );
  const mutedTrackColor = colorWithAlpha(
    uiTokens.colors.textMuted,
    uiTokens.mode === "dark" ? 0.48 : 0.34
  );

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
    <View
      style={[
        styles.container,
        { gap: uiTokens.spacing.sm, padding: uiTokens.spacing.md },
        disabled && styles.disabledContainer,
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.labelRow, { gap: uiTokens.spacing.xs }]}>
          <Ionicons name="text-outline" size={18} color={labelColor} />
          <Text style={[styles.label, { color: labelColor }]}>Font Size</Text>
        </View>
        <Text style={[styles.valueLabel, { color: accentColor }]}>{getSizeLabel()}</Text>
      </View>

      <View style={[styles.sliderContainer, { gap: uiTokens.spacing.sm }]}>
        <Text style={[styles.minMaxLabel, { color: secondaryTextColor, fontSize: minValue }]}>
          A
        </Text>

        <Slider
          style={styles.slider}
          value={value}
          onValueChange={handleValueChange}
          minimumValue={minValue}
          maximumValue={maxValue}
          step={step}
          minimumTrackTintColor={accentColor}
          maximumTrackTintColor={mutedTrackColor}
          thumbTintColor={disabled ? uiTokens.colors.textMuted : uiTokens.colors.accentStrong}
          disabled={disabled}
        />

        <Text style={[styles.minMaxLabel, { color: secondaryTextColor, fontSize: maxValue }]}>
          A
        </Text>
      </View>

      {/* Preview Text */}
      <View
        style={[
          styles.previewContainer,
          {
            backgroundColor: previewBackground,
            borderColor: colorWithAlpha(
              uiTokens.colors.accent,
              uiTokens.mode === "dark" ? 0.28 : 0.18
            ),
            borderRadius: uiTokens.radius.md,
            padding: uiTokens.spacing.sm,
          },
        ]}
      >
        <Text style={[styles.previewText, { color: labelColor, fontSize: value }]}>
          Sample Text Preview
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
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
  },
  label: {
    fontSize: typography.fontSize.base,
    fontWeight: "500",
  },
  valueLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: "600",
  },
  sliderContainer: {
    flexDirection: "row",
    alignItems: "center",
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
    borderWidth: 1,
    alignItems: "center",
  },
  previewText: {
    fontFamily: fontFamily.regular,
  },
});

export default FontSizeSlider;
