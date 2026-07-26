import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { useAuthStore } from "@/store/authStore";
import { getRouteForRole, UserRole } from "@/utils/roleNavigation";

import { colors as uiColors, semanticColors as uiSemanticColors } from "@/theme/legacyCompat";
function IndexScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  useEffect(() => {
    if (isLoading || !isInitialized) {
      return;
    }

    if (user) {
      const target = getRouteForRole(user.role as UserRole);
      router.replace(target as any);
      return;
    }

    router.replace("/welcome");
  }, [isInitialized, isLoading, router, user]);

  return (
    <View style={styles.page}>
      <StatusBar style="dark" />
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Lavanya Mart</Text>
        <Text style={styles.title}>Stock Verification</Text>
        <Text style={styles.subtitle}>
          Preparing the operational workspace and restoring your session.
        </Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={uiColors.secondary[700]} />
          <Text style={styles.loadingText}>Initializing secure environment</Text>
        </View>
      </View>
    </View>
  );
}

export { IndexScreen };
export default IndexScreen;

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: uiColors.neutral[50],
  },
  card: {
    width: "100%",
    maxWidth: 440,
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: uiColors.neutral[200],
    backgroundColor: uiSemanticColors.text.inverse,
    boxShadow: "0px 16px 40px rgba(15, 23, 42, 0.08)",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: uiColors.secondary[700],
    marginBottom: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: uiColors.neutral[900],
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: uiColors.neutral[600],
    marginBottom: 24,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: uiColors.neutral[700],
  },
});
