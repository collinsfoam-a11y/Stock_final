import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";

import {
  getPublicRouteForRole,
  useWebPublicSession,
} from "@/bootstrap/useWebPublicSession";

function IndexScreen() {
  const router = useRouter();
  const { status, user } = useWebPublicSession();

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    if (user) {
      const target = getPublicRouteForRole(user.role);
      router.replace(target as any);
      return;
    }

    router.replace("/welcome");
  }, [router, status, user]);

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
          <ActivityIndicator size="small" color="#0f766e" />
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
    backgroundColor: "#f4f7f6",
  },
  card: {
    width: "100%",
    maxWidth: 440,
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d9e5e2",
    backgroundColor: "#ffffff",
    boxShadow: "0px 16px 40px rgba(15, 23, 42, 0.08)",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#0f766e",
    marginBottom: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#475569",
    marginBottom: 24,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#334155",
  },
});
