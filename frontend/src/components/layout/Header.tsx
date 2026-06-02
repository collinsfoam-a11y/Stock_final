/**
 * Header Component - App header with navigation
 */

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../../hooks/useTheme";
import { getAccessibleButtonProps, getDecorativeIconProps } from "@/utils/accessibility";
import { haptics } from "@/services/haptics";

import { semanticColors as uiSemanticColors, shadows as uiShadows } from "@/theme/legacyCompat";
interface HeaderProps {
  title: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  leftIconAccessibilityLabel?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  rightIconAccessibilityLabel?: string;
  onLeftPress?: () => void;
  onRightPress?: () => void;
  subtitle?: string;
  showBack?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  leftIcon,
  leftIconAccessibilityLabel,
  rightIcon,
  rightIconAccessibilityLabel,
  onLeftPress,
  onRightPress,
  subtitle,
  showBack = false,
}) => {
  const theme = useTheme();

  const handleLeftPress = () => {
    void haptics.light();
    onLeftPress?.();
  };

  const handleRightPress = () => {
    void haptics.light();
    onRightPress?.();
  };

  return (
    <>
      <StatusBar
        barStyle={theme.isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.colors.background}
      />
      <View style={[styles.container, { backgroundColor: theme.colors.primary }]}>
        <View style={styles.leftContainer}>
          {(leftIcon || showBack) && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleLeftPress}
              activeOpacity={0.7}
              {...getAccessibleButtonProps({
                label: leftIconAccessibilityLabel || (leftIcon === "menu" ? "Menu" : "Go back"),
                hint: leftIcon === "menu" ? "Opens the main menu" : "Returns to the previous screen",
              })}
            >
              <Ionicons
                {...getDecorativeIconProps()}
                name={leftIcon || "arrow-back"}
                size={24}
                color={uiSemanticColors.text.inverse}
              />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.centerContainer}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>

        <View style={styles.rightContainer}>
          {rightIcon && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleRightPress}
              activeOpacity={0.7}
              {...getAccessibleButtonProps({
                label: rightIconAccessibilityLabel || "Header action",
                hint: "Performs the primary action for this screen",
              })}
            >
              <Ionicons
                {...getDecorativeIconProps()}
                name={rightIcon}
                size={24}
                color={uiSemanticColors.text.inverse}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 48,
    minHeight: 80,
    elevation: 4,
    ...uiShadows.md,
  },
  leftContainer: {
    width: 40,
    alignItems: "flex-start",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
  },
  rightContainer: {
    width: 40,
    alignItems: "flex-end",
  },
  iconButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: uiSemanticColors.text.inverse,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    color: uiSemanticColors.text.inverse,
    opacity: 0.9,
    textAlign: "center",
    marginTop: 2,
  },
});
