/**
 * Bottom Navigation Bar - Shared Component v3.0
 *
 * A reusable bottom navigation bar for workflow screens.
 * Supports customizable tabs with icons and callbacks.
 */

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors as unifiedColors, radius, spacing } from "@/theme/unified";
import { useThemeContext } from "@/context/ThemeContext";
import {
  getDefaultInventoryTabs,
  NavTab,
  NavTabId,
} from "./bottomNavShared";

interface BottomNavBarProps {
  tabs: NavTab[];
  activeTabId: NavTabId;
  onTabChange?: (tabId: NavTabId) => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  tabs,
  activeTabId,
  onTabChange,
}) => {
  const { themeLegacy: appTheme, isDark } = useThemeContext();
  const { colors } = appTheme;

  const handleTabPress = (tab: NavTab) => {
    if (onTabChange) {
      onTabChange(tab.id);
    }
    tab.onPress();
  };

  return (
    <View
      style={[
        styles.bottomNavigation,
        {
          backgroundColor: isDark
            ? unifiedColors.neutral[900]
            : unifiedColors.white,
          borderTopColor: colors.border,
        },
      ]}
    >
      {tabs.map((tab) => {
        const isActive = activeTabId === tab.id;
        const activeColor = tab.activeColor || colors.primary;
        const inactiveColor = colors.textSecondary;

        return (
          <TouchableOpacity
            key={tab.id}
            style={styles.bottomNavItem}
            onPress={() => handleTabPress(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            <View
              style={[
                styles.bottomNavIconContainer,
                isActive && { backgroundColor: activeColor + "15" },
              ]}
            >
              <Ionicons
                name={isActive ? tab.iconFilled : tab.icon}
                size={22}
                color={isActive ? activeColor : inactiveColor}
              />
            </View>
            <Text
              style={[
                styles.bottomNavLabel,
                { color: isActive ? activeColor : inactiveColor },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export { getDefaultInventoryTabs };
export type { NavTab, NavTabId };

const styles = StyleSheet.create({
  bottomNavigation: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingBottom: Platform.OS === "ios" ? 28 : spacing.md,
    borderTopWidth: 1,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomNavItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xs,
    minWidth: 64,
  },
  bottomNavIconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  bottomNavLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
});

export default BottomNavBar;
