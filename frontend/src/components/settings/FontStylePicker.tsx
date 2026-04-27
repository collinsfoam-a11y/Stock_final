import React from "react";
import { View, Text, StyleSheet, Platform, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useTheme } from "../../hooks/useTheme";
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
  const { colors, typography, spacing, borderRadius } = useTheme();

  return (
    <View style={[styles.container, disabled && styles.disabledContainer]}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Ionicons name="text" size={18} color={disabled ? colors.textTertiary : colors.text} />
          <Text
            style={[
              styles.label,
              { color: colors.text, fontSize: typography.fontSize.md },
              disabled && { color: colors.textTertiary },
            ]}
          >
            Font Style
          </Text>
        </View>
      </View>

      <View style={styles.options}>
        {FONT_STYLE_OPTIONS.map((option) => {
          const isSelected = option.value === value;
          const families = resolveFontFamilies(option.value);

          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ disabled, selected: isSelected }}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: colors.surface,
                  borderColor: isSelected ? colors.accent || colors.primary : colors.border,
                  borderRadius: borderRadius.lg,
                  minHeight: 88,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.sm,
                },
                isSelected && {
                  backgroundColor: colors.overlayPrimary || colors.surface,
                },
                pressed && !disabled && styles.optionPressed,
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
                  { fontFamily: families.body },
                  { color: isSelected ? colors.primary : colors.text },
                ]}
              >
                {option.preview}
              </Text>
              <Text
                style={[
                  styles.optionLabel,
                  {
                    color: isSelected ? colors.text : colors.textSecondary,
                    fontSize: typography.fontSize.sm,
                  },
                  disabled && { color: colors.textTertiary },
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
  options: {
    flexDirection: "row",
    gap: 8,
  },
  option: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    gap: 4,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionPressed: {
    opacity: 0.85,
  },
  preview: {
    fontSize: 22,
  },
  optionLabel: {
    fontWeight: "500",
  },
});

export default FontStylePicker;
