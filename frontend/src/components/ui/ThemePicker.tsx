/**
 * ThemePicker Component
 *
 * Restricts appearance selection to light and dark mode only.
 */

import * as React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";

import { useTheme } from "../../hooks/useTheme";
import { useSettingsStore } from "../../store/settingsStore";

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
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          Appearance Mode
        </Text>
        <View
          style={[
            styles.modeToggle,
            { backgroundColor: colors.surface, gap: compact ? 6 : 8 },
          ]}
        >
          {[
            { value: "light" as const, label: "Light", icon: "sunny-outline" },
            { value: "dark" as const, label: "Dark", icon: "moon-outline" },
          ].map((mode) => (
            <TouchableOpacity
              key={mode.value}
              style={[
                styles.modeButton,
                theme === mode.value && { backgroundColor: colors.accent },
              ]}
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.selectionAsync();
                }
                setSetting("theme", mode.value);
              }}
            >
              <Ionicons
                name={mode.icon as any}
                size={18}
                color={theme === mode.value ? "#FFFFFF" : colors.textSecondary}
              />
              <Text
                style={[
                  styles.modeButtonText,
                  {
                    color:
                      theme === mode.value ? "#FFFFFF" : colors.textSecondary,
                  },
                ]}
              >
                {mode.label}
              </Text>
            </TouchableOpacity>
          ))}
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

export default ThemePicker;
