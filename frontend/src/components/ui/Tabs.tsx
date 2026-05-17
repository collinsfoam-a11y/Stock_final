/**
 * Tabs Component
 * Navigation tabs with smooth animations
 * Phase 2: Design System - Core Components
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  LayoutChangeEvent,
} from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import {
  colors,
  semanticColors,
  spacing,
  radius,
  textStyles,
  touchTargets,
  hitSlop,
} from "@/theme/legacyCompat";

export interface Tab {
  key: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  variant?: "default" | "pills" | "underline";
  scrollable?: boolean;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  variant = "default",
  scrollable = false,
}) => {
  const [tabLayouts, setTabLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const indicatorPosition = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);

  React.useEffect(() => {
    const layout = tabLayouts[activeTab];
    if (layout) {
      indicatorPosition.value = withSpring(layout.x, {
        damping: 15,
        stiffness: 150,
      });
      indicatorWidth.value = withSpring(layout.width, {
        damping: 15,
        stiffness: 150,
      });
    }
  }, [activeTab, indicatorPosition, indicatorWidth, tabLayouts]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorPosition.value }],
    width: indicatorWidth.value,
  }));

  const handleTabLayout = (key: string, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setTabLayouts((prev) => ({
      ...prev,
      [key]: { x, width },
    }));
  };

  const renderTab = (tab: Tab) => {
    const isActive = tab.key === activeTab;

    return (
      <TouchableOpacity
        key={tab.key}
        onPress={() => onTabChange(tab.key)}
        onLayout={(event) => handleTabLayout(tab.key, event)}
        style={[
          styles.tab,
          !scrollable && styles.tabFlex,
          variant === "pills" && styles.tabPill,
          variant === "pills" && isActive && styles.tabPillActive,
        ]}
        activeOpacity={0.8}
        hitSlop={hitSlop.small}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
      >
        {tab.icon ? <View style={styles.tabIcon}>{tab.icon}</View> : null}

        <Text
          style={[
            styles.tabLabel,
            isActive && styles.tabLabelActive,
            variant === "pills" && isActive && styles.tabLabelPillActive,
          ]}
        >
          {tab.label}
        </Text>

        {tab.badge !== undefined && tab.badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{tab.badge > 99 ? "99+" : tab.badge}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.wrapper}>
      {scrollable ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          style={styles.container}
        >
          {tabs.map(renderTab)}
        </ScrollView>
      ) : (
        <View style={styles.container}>{tabs.map(renderTab)}</View>
      )}

      {variant === "underline" ? (
        <Animated.View style={[styles.indicator, indicatorStyle]} />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
  },
  container: {
    flexDirection: "row",
    backgroundColor: semanticColors.background.primary,
    borderBottomWidth: 1,
    borderBottomColor: semanticColors.border.subtle,
  },
  scrollContent: {
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTargets.minimum,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  tabFlex: {
    flex: 1,
  },
  tabPill: {
    borderRadius: radius.full,
    backgroundColor: semanticColors.background.tertiary,
  },
  tabPillActive: {
    backgroundColor: semanticColors.interactive.default,
  },
  tabIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    ...textStyles.bodySmall,
    fontWeight: "500",
    color: semanticColors.text.secondary,
  },
  tabLabelActive: {
    color: semanticColors.interactive.default,
    fontWeight: "600",
  },
  tabLabelPillActive: {
    color: colors.white,
  },
  badge: {
    backgroundColor: semanticColors.status.error,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    ...textStyles.captionSmall,
    fontWeight: "600",
    color: colors.white,
  },
  indicator: {
    position: "absolute",
    bottom: 0,
    height: 3,
    backgroundColor: semanticColors.interactive.default,
    borderRadius: radius.xs,
  },
});
