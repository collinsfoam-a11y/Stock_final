import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

interface BootLoadingViewProps {
  initError: string | null;
}

export function BootLoadingView({ initError }: BootLoadingViewProps) {
  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Lavanya Mart</Text>
        <Text style={styles.title}>Starting secure workspace</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#0f766e" />
          <Text style={styles.loadingText}>Restoring session and settings</Text>
        </View>
        {initError ? <Text style={styles.warning}>{initError}</Text> : null}
      </View>
    </View>
  );
}

interface BootErrorViewProps {
  initError: string;
}

export function BootErrorView({ initError }: BootErrorViewProps) {
  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Lavanya Mart</Text>
        <Text style={styles.errorTitle}>Initialization issue</Text>
        <Text style={styles.errorBody}>{initError}</Text>
        <Text style={styles.errorHint}>The app will continue with limited recovery.</Text>
      </View>
    </View>
  );
}

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
    fontSize: 28,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 18,
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
  warning: {
    marginTop: 18,
    fontSize: 13,
    lineHeight: 20,
    color: "#b45309",
  },
  errorTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#991b1b",
    marginBottom: 14,
  },
  errorBody: {
    fontSize: 14,
    lineHeight: 22,
    color: "#475569",
    marginBottom: 18,
  },
  errorHint: {
    fontSize: 13,
    color: "#0f766e",
    fontWeight: "600",
  },
});
