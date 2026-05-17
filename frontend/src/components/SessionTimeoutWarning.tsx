import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { useSessionTimeout } from "../hooks/useSessionTimeout";
import { createLogger } from "../services/logging";

import { semanticColors, shadows, colors } from "@/theme/legacyCompat";
const log = createLogger("SessionTimeoutWarning");

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export function SessionTimeoutWarning(): React.ReactElement | null {
  const { showWarning, secondsRemaining, dismissWarning, refreshSession } = useSessionTimeout();

  if (!showWarning) {
    return null;
  }

  const handleRefresh = async () => {
    await refreshSession();
    log.info("Session refreshed from warning modal");
  };

  const handleDismiss = () => {
    dismissWarning();
    log.debug("Session warning dismissed");
  };

  return (
    <Modal visible={showWarning} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.icon}>⏰</Text>
          <Text style={styles.title}>Session Expiring</Text>
          <Text style={styles.message}>
            Your session will expire in{" "}
            <Text style={styles.highlight}>{formatTime(secondsRemaining)}</Text>
          </Text>
          <Text style={styles.subtitle}>Would you like to stay signed in?</Text>

          <View style={styles.buttons}>
            <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleRefresh}>
              <Text style={styles.primaryButtonText}>Stay Signed In</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={handleDismiss}
            >
              <Text style={styles.secondaryButtonText}>Sign Out Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    backgroundColor: semanticColors.background.elevated,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    ...shadows.lg,
    elevation: 8,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: semanticColors.text.primary,
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    fontSize: 16,
    color: semanticColors.text.secondary,
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 22,
  },
  highlight: {
    fontWeight: "700",
    color: colors.warning[700],
  },
  subtitle: {
    fontSize: 14,
    color: semanticColors.text.tertiary,
    textAlign: "center",
    marginBottom: 24,
  },
  buttons: {
    width: "100%",
    gap: 12,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: colors.info[600],
  },
  primaryButtonText: {
    color: semanticColors.text.inverse,
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: semanticColors.border.default,
  },
  secondaryButtonText: {
    color: semanticColors.text.secondary,
    fontSize: 14,
    fontWeight: "500",
  },
});
