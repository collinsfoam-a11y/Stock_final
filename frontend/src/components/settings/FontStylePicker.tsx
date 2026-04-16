import React from "react";
import { View, Text, StyleSheet, Platform, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";

import { auroraTheme } from "../../theme/auroraTheme";
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
  return (
    <View style={[styles.container, disabled && styles.disabledContainer]}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Ionicons
            name="text"
            size={18}
            color={
              disabled
                ? auroraTheme.colors.text.tertiary
                : auroraTheme.colors.text.primary
            }
          />
          <Text style={[styles.label, disabled && styles.disabledLabel]}>
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
              style={[
                styles.option,
                isSelected && styles.optionSelected,
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
                  isSelected && styles.previewSelected,
                ]}
              >
                {option.preview}
              </Text>
              <Text
                style={[
                  styles.optionLabel,
                  isSelected && styles.optionLabelSelected,
                  disabled && styles.disabledLabel,
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
    padding: auroraTheme.spacing.md,
    gap: auroraTheme.spacing.sm,
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
    gap: auroraTheme.spacing.xs,
  },
  label: {
    fontSize: auroraTheme.typography.fontSize.base,
    fontWeight: "500",
    color: auroraTheme.colors.text.primary,
  },
  disabledLabel: {
    color: auroraTheme.colors.text.tertiary,
  },
  options: {
    flexDirection: "row",
    gap: auroraTheme.spacing.sm,
  },
  option: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: auroraTheme.spacing.sm,
    paddingHorizontal: auroraTheme.spacing.sm,
    borderRadius: auroraTheme.borderRadius.lg,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.light,
    backgroundColor: auroraTheme.colors.background.glass,
    gap: auroraTheme.spacing.xs,
  },
  optionSelected: {
    borderColor: auroraTheme.colors.primary[500],
    backgroundColor: "rgba(14, 165, 233, 0.12)",
  },
  optionDisabled: {
    opacity: 0.5,
  },
  preview: {
    fontSize: 22,
    color: auroraTheme.colors.text.primary,
  },
  previewSelected: {
    color: auroraTheme.colors.primary[500],
  },
  optionLabel: {
    fontSize: auroraTheme.typography.fontSize.sm,
    color: auroraTheme.colors.text.secondary,
    fontWeight: "500",
  },
  optionLabelSelected: {
    color: auroraTheme.colors.text.primary,
  },
});

export default FontStylePicker;
