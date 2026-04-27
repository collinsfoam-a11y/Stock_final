import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { ThemeProvider } from "../context/ThemeContext";
import { useSettingsStore } from "../store/settingsStore";
import {
  getPublicRouteForRole,
  useWebPublicSession,
} from "./useWebPublicSession";

export default function PublicThemeShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const { status, user } = useWebPublicSession();

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  React.useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(getPublicRouteForRole(user.role) as any);
    }
  }, [router, status, user]);

  const content =
    status === "authenticated" && user ? (
      <View style={styles.redirecting}>
        <ActivityIndicator size="small" color="#0f766e" />
      </View>
    ) : (
      children
    );

  return (
    <ErrorBoundary>
      <ThemeProvider>{content}</ThemeProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  redirecting: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4f7f6",
  },
});
