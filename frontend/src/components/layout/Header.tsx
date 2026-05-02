/**
 * Header Component - App header with navigation
 */

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../../hooks/useTheme";
import { operationalTheme } from "../../theme/operationalTheme";

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

  return (
    <>
      <StatusBar
        barStyle={theme.isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.isDark ? theme.colors.background : operationalTheme.background}
      />
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.isDark ? theme.colors.surface : operationalTheme.background,
            borderBottomColor: theme.isDark ? theme.colors.border : operationalTheme.border,
          },
        ]}
      >
        <View style={styles.leftContainer}>
          {(leftIcon || showBack) && (
            <TouchableOpacity style={styles.iconButton} onPress={onLeftPress} activeOpacity={0.7}>
              <Ionicons
                name={leftIcon || "arrow-back"}
                size={24}
                color={theme.isDark ? "#FFFFFF" : operationalTheme.text}
              />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.centerContainer}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && (
            <Text
              style={[
                styles.subtitle,
                {
                  color: theme.isDark ? "rgba(255,255,255,0.9)" : operationalTheme.textSecondary,
                },
              ]}
            >
              {subtitle}
            </Text>
          )}
        </View>

        <View style={styles.rightContainer}>
          {rightIcon && (
            <TouchableOpacity style={styles.iconButton} onPress={onRightPress} activeOpacity={0.7}>
              <Ionicons
                name={rightIcon}
                size={24}
                color={theme.isDark ? "#FFFFFF" : operationalTheme.text}
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
    paddingTop: Platform.OS === "ios" ? 48 : 20,
    minHeight: 84,
    borderBottomWidth: 1,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: operationalTheme.surface,
    borderWidth: 1,
    borderColor: operationalTheme.border,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: operationalTheme.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 2,
  },
});
