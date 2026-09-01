/**
 * ThemePicker Component
 *
 * Restricts appearance selection to light and dark mode only.
 */

import * as React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useTheme } from "../../hooks/useTheme";
import { useSettingsStore } from "../../store/settingsStore";
import { haptics } from "@/services/haptics";
import { getAccessibleButtonProps, getDecorativeIconProps } from "@/utils/accessibility";

import { semanticColors as uiSemanticColors } from "@/theme/unified";
import { AppTouchable } from "@/components/ui/AppTouchable";
interface ThemePickerProps {
  compact?: boolean;
}

export const ThemePicker: React.FC<ThemePickerProps> = ({ compact = false }) => {
  const { colors } = useTheme();
  const theme = useSettingsStore((state) => state.settings.theme);
  const setSetting = useSettingsStore((state) => state.setSetting);

  return (
    <View style={styles.container}>
      <View style={styles.modeSection}>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Appearance Mode</Text>
        <View
          style={[styles.modeToggle, { backgroundColor: colors.surface, gap: compact ? 6 : 8 }]}
        >
          {[
            { value: "light" as const, label: "Light", icon: "sunny-outline" },
            { value: "dark" as const, label: "Dark", icon: "moon-outline" },
          ].map((mode) => {
            const isSelected = theme === mode.value;
            return (
              <AppTouchable
                key={mode.value}
                {...getAccessibleButtonProps({
                  label: `${mode.label} theme`,
                  selected: isSelected,
                })}
                style={[
                  styles.modeButton,
                  isSelected && { backgroundColor: colors.accent },
                ]}
                onPress={() => {
                  void haptics.selection();
                  setSetting("theme", mode.value);
                }}
              >
                <Ionicons
                  name={mode.icon as any}
                  size={18}
                  color={isSelected ? uiSemanticColors.text.inverse : colors.textSecondary}
                  {...getDecorativeIconProps()}
                />
                <Text
                  style={[
                    styles.modeButtonText,
                    {
                      color: isSelected
                        ? uiSemanticColors.text.inverse
                        : colors.textSecondary,
                    },
                  ]}
                >
                  {mode.label}
                </Text>
              </AppTouchable>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  modeSection: {
    gap: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  modeToggle: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: "500",
  },
});

