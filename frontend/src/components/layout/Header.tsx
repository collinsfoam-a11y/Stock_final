/**
 * Header Component — Claude Design
 * Clean surface-style header with warm tones and terracotta accents
 */

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../../hooks/useTheme";
import { shadows as uiShadows } from "@/theme/legacyCompat";

interface HeaderProps {
  title: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onLeftPress?: () => void;
  onRightPress?: () => void;
  subtitle?: string;
  showBack?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  leftIcon,
  rightIcon,
  onLeftPress,
  onRightPress,
  subtitle,
  showBack = false,
}) => {
  const theme = useTheme();

  const bgColor = theme.isDark ? theme.colors.surface : theme.colors.background;
  const borderColor = theme.colors.borderLight;
  const titleColor = theme.colors.textPrimary;
  const subtitleColor = theme.colors.textSecondary;
  const iconColor = theme.colors.textPrimary;
  const iconBtnBg = theme.isDark ? "rgba(255,250,245,0.06)" : "rgba(28,25,23,0.05)";

  return (
    <>
      <StatusBar
        barStyle={theme.isDark ? "light-content" : "dark-content"}
        backgroundColor={bgColor}
      />
      <View
        style={[
          styles.container,
          {
            backgroundColor: bgColor,
            borderBottomColor: borderColor,
          },
        ]}
      >
        <View style={styles.leftContainer}>
          {(leftIcon || showBack) && (
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: iconBtnBg }]}
              onPress={onLeftPress}
              activeOpacity={0.7}
            >
              <Ionicons
                name={leftIcon || "arrow-back"}
                size={22}
                color={iconColor}
              />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.centerContainer}>
          <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: subtitleColor }]}>{subtitle}</Text>
          )}
        </View>

        <View style={styles.rightContainer}>
          {rightIcon && (
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: iconBtnBg }]}
              onPress={onRightPress}
              activeOpacity={0.7}
            >
              <Ionicons name={rightIcon} size={22} color={iconColor} />
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
    paddingVertical: 10,
    paddingTop: Platform.OS === "ios" ? 52 : 44,
    minHeight: 76,
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...uiShadows.sm,
  },
  leftContainer: {
    width: 44,
    alignItems: "flex-start",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
  },
  rightContainer: {
    width: 44,
    alignItems: "flex-end",
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "400",
    textAlign: "center",
    marginTop: 2,
    opacity: 0.85,
  },
});
