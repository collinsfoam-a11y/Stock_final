/**
 * Staff Tab Layout
 *
 * Apple HIG: a tab bar is the top-level navigation for an app whose sections
 * are peers - it keeps every section one tap away and shows where you are.
 * Staff work is exactly that shape (count, review, adjust), so the four staff
 * sections live in tabs while detail screens (item-detail) push on the stack
 * above this layout and hide the bar.
 *
 * Icons come from AppIcon, so iOS renders SF Symbols and Android/web fall back
 * to Ionicons.
 */

import React from "react";
import { Platform, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";

import { AppIcon } from "@/components/ui/AppIcon";
import { useUiTokens } from "@/hooks/useUiTokens";

const TABS = [
  { name: "home", title: "Home", icon: "home-outline", activeIcon: "home" },
  { name: "scan", title: "Scan", icon: "scan-outline", activeIcon: "scan" },
  { name: "history", title: "History", icon: "time-outline", activeIcon: "time" },
  { name: "settings", title: "Settings", icon: "settings-outline", activeIcon: "settings" },
] as const;

export default function StaffTabsLayout() {
  const uiTokens = useUiTokens();
  const isIOS = Platform.OS === "ios";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: uiTokens.colors.accent,
        tabBarInactiveTintColor: uiTokens.colors.textMuted,
        // On iOS the bar floats over content with a system material behind it.
        tabBarStyle: isIOS
          ? { position: "absolute", borderTopColor: uiTokens.colors.border }
          : {
              backgroundColor: uiTokens.colors.surface,
              borderTopColor: uiTokens.colors.border,
            },
        tabBarBackground: isIOS
          ? () => (
              <BlurView
                tint={uiTokens.mode === "dark" ? "dark" : "light"}
                intensity={80}
                style={StyleSheet.absoluteFill}
              />
            )
          : undefined,
        // Tab labels sit in fixed-width slots. They still follow Dynamic Type;
        // the bar grows with them rather than clipping.
        tabBarAllowFontScaling: true,
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size, focused }) => (
              <AppIcon
                name={focused ? tab.activeIcon : tab.icon}
                size={size}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
