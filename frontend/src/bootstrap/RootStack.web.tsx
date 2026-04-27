import React from "react";
import { View } from "react-native";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "../hooks/useTheme";
import { useAutoLogout } from "../hooks/useAutoLogout";
import { useSettingsStore } from "../store/settingsStore";

export function RootStack() {
  const theme = useTheme();
  const requireAuth = useSettingsStore((state) => state.settings.requireAuth);
  const sessionTimeout = useSettingsStore(
    (state) => state.settings.sessionTimeout,
  );
  const { resetTimer } = useAutoLogout(requireAuth, sessionTimeout * 60 * 1000);

  return (
    <View
      style={{ flex: 1 }}
      onTouchStart={resetTimer}
      onStartShouldSetResponderCapture={() => {
        resetTimer();
        return false;
      }}
    >
      <StatusBar style={theme.isDark ? "light" : "dark"} />
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <Slot />
      </View>
    </View>
  );
}
