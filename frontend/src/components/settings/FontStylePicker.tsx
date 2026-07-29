import React from "react";
import { View, Text, StyleSheet, Platform, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "../../hooks/useUiTokens";
import { typography } from "@/theme/unified";
import { colorWithAlpha } from "../../theme/themeTokens";
import {
  FONT_STYLE_OPTIONS,
  FontStylePreference,
  resolveFontFamilies,
} from "../../theme/fontPreferences";

interface FontStylePickerProps {
  value: FontStylePreference;
  onValueChange: (value: FontStylePreference) => void;
  disabled?: boolean;
}

export const FontStylePicker: React.FC<FontStylePickerProps> = ({
  value,
  onValueChange,
  disabled = false,
}) => {
  const uiTokens = useUiTokens();
  const labelColor = disabled ? uiTokens.colors.textMuted : uiTokens.colors.textPrimary;
  const selectedBackground = colorWithAlpha(
    uiTokens.colors.accent,
    uiTokens.mode === "dark" ? 0.18 : 0.08
  );

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
          <Ionicons name="text" size={18} color={labelColor} />
          <Text style={[styles.label, { color: labelColor }]}>Font Style</Text>
        </View>
      </View>

      <View style={[styles.options, { gap: uiTokens.spacing.sm }]}>
        {FONT_STYLE_OPTIONS.map((option) => {
          const isSelected = option.value === value;
          const families = resolveFontFamilies(option.value);

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: isSelected }}
              key={option.value}
              style={[
                styles.option,
                {
                  backgroundColor: isSelected ? selectedBackground : uiTokens.colors.surface,
                  borderColor: isSelected ? uiTokens.colors.accent : uiTokens.colors.border,
                  borderRadius: uiTokens.radius.md,
                  gap: uiTokens.spacing.xs,
                  paddingHorizontal: uiTokens.spacing.sm,
                  paddingVertical: uiTokens.spacing.sm,
                },
                disabled && styles.optionDisabled,
              ]}
              onPress={() => {
                if (disabled) {
                  return;
                }
                if (Platform.OS !== "web") {
                  Haptics.selectionAsync();
                }
                onValueChange(option.value);
              }}
            >
              <Text
                style={[
                  styles.preview,
                  {
                    color: isSelected ? uiTokens.colors.accentStrong : uiTokens.colors.textPrimary,
                    fontFamily: families.body,
                  },
                ]}
              >
                {option.preview}
              </Text>
              <Text
                style={[
                  styles.optionLabel,
                  {
                    color: disabled
                      ? uiTokens.colors.textMuted
                      : isSelected
                        ? uiTokens.colors.textPrimary
                        : uiTokens.colors.textSecondary,
                  },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
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
  options: {
    flexDirection: "row",
  },
  option: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  preview: {
    fontSize: 22,
  },
  optionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: "500",
  },
});


