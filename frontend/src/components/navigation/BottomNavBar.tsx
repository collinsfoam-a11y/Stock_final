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
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import {
  BOTTOM_NAV_HIT_SLOP,
  getDefaultInventoryTabs,
  getResponsiveBottomNavTabMinWidth,
  NavTab,
  NavTabId,
} from "./bottomNavShared";

interface BottomNavBarProps {
  tabs: NavTab[];
  activeTabId: NavTabId;
  onTabChange?: (tabId: NavTabId) => void;
}

interface BottomNavItemProps {
  tab: NavTab;
  isActive: boolean;
  activeColor: string;
  inactiveColor: string;
  iconBackground: string;
  minWidth: number;
  onPress: (tab: NavTab) => void;
}

const BottomNavItem = React.memo(
  ({
    tab,
    isActive,
    activeColor,
    inactiveColor,
    iconBackground,
    minWidth,
    onPress,
  }: BottomNavItemProps) => (
    <TouchableOpacity
      key={tab.id}
      activeOpacity={0.86}
      hitSlop={BOTTOM_NAV_HIT_SLOP}
      style={[styles.bottomNavItem, { minWidth }]}
      onPress={() => onPress(tab)}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
      accessibilityHint={`Open ${tab.label}`}
    >
      <View
        style={[styles.bottomNavIconContainer, isActive && { backgroundColor: iconBackground }]}
      >
        <Ionicons
          name={isActive ? tab.iconFilled : tab.icon}
          size={22}
          color={isActive ? activeColor : inactiveColor}
        />
      </View>
      <Text
        numberOfLines={1}
        style={[styles.bottomNavLabel, { color: isActive ? activeColor : inactiveColor }]}
      >
        {tab.label}
      </Text>
    </TouchableOpacity>
  )
);
BottomNavItem.displayName = "BottomNavItem";

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ tabs, activeTabId, onTabChange }) => {
  const tokens = useUiTokens();
  const { width } = useWindowDimensions();
  const tabMinWidth = getResponsiveBottomNavTabMinWidth(width, tabs.length, Platform.OS);

  const handleTabPress = React.useCallback(
    (tab: NavTab) => {
      if (onTabChange) {
        onTabChange(tab.id);
      }
      tab.onPress();
    },
    [onTabChange]
  );

  return (
    <View
      style={[
        styles.bottomNavigation,
        {
          backgroundColor: tokens.colors.surface,
          borderTopColor: tokens.colors.border,
          paddingVertical: tokens.spacing.sm,
          paddingBottom:
            Platform.OS === "ios" ? Math.max(28, tokens.spacing.lg) : tokens.spacing.md,
        },
      ]}
    >
      {tabs.map((tab) => {
        const isActive = activeTabId === tab.id;
        const activeColor = tab.activeColor || tokens.colors.accent;
        const inactiveColor = tokens.colors.textMuted;
        const iconBackground = colorWithAlpha(activeColor, tokens.mode === "dark" ? 0.22 : 0.12);

        return (
          <BottomNavItem
            key={tab.id}
            tab={tab}
            isActive={isActive}
            activeColor={activeColor}
            inactiveColor={inactiveColor}
            iconBackground={iconBackground}
            minWidth={tabMinWidth}
            onPress={handleTabPress}
          />
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
    borderTopWidth: 1,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomNavItem: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  bottomNavIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  bottomNavLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0,
    maxWidth: 86,
  },
});

export default BottomNavBar;
