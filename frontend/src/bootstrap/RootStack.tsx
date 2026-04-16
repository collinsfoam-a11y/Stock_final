import React from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        onTouchStart={resetTimer}
        onStartShouldSetResponderCapture={() => {
          resetTimer();
          return false;
        }}
      >
        <StatusBar style={theme.isDark ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" />
          <Stack.Screen name="register" />
          <Stack.Screen name="help" />
          <Stack.Screen name="security" options={{ presentation: "modal" }} />
          <Stack.Screen name="+not-found" />
        </Stack>
      </View>
    </GestureHandlerRootView>
  );
}
