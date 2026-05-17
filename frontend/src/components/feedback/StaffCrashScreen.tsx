/**
 * StaffCrashScreen Component
 *
 * Fallback UI for ErrorBoundary in staff layouts.
 * Provides a recovery path when staff screens crash.
 * Optimized for scan-first workflow recovery.
 */

import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getAccessibleButtonProps } from "@/utils/accessibility";

interface StaffCrashScreenProps {
  error: Error;
  resetError: () => void;
}

export const StaffCrashScreen: React.FC<StaffCrashScreenProps> = ({ error, resetError }) => {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);

  const handleGoToScan = () => {
    resetError();
    router.replace("/staff/scan");
  };

  const handleLogout = () => {
    resetError();
    router.replace("/welcome" as any);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={uiTokens.colors.error} />
        </View>

        <Text style={styles.title}>Scan Workflow Recovery Required</Text>
        <Text style={styles.subtitle}>
          The scanning interface stopped before the current workflow could finish rendering.
        </Text>

        <View style={styles.errorBox}>
          <Text style={styles.errorLabel}>Error Details:</Text>
          <Text style={styles.errorMessage}>
            {error.message ||
              "The scan screen failed before technical details were available. Retry, or return to scan and continue from the last saved item."}
          </Text>
        </View>

        {__DEV__ && error.stack && (
          <ScrollView style={styles.stackContainer}>
            <Text style={styles.stackTitle}>Stack Trace (Dev Only):</Text>
            <Text style={styles.stack}>{error.stack}</Text>
          </ScrollView>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            {...getAccessibleButtonProps({ label: "Retry loading scan workflow" })}
            style={[styles.button, styles.primaryButton]}
            onPress={resetError}
          >
            <Ionicons name="refresh" size={20} color={uiTokens.colors.surface} />
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </TouchableOpacity>

          <TouchableOpacity
            {...getAccessibleButtonProps({ label: "Return to staff scan screen" })}
            style={[styles.button, styles.secondaryButton]}
            onPress={handleGoToScan}
          >
            <Ionicons name="scan-outline" size={20} color={uiTokens.colors.accent} />
            <Text style={styles.secondaryButtonText}>Back to Scan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            {...getAccessibleButtonProps({ label: "Log out after scan workflow error" })}
            style={[styles.button, styles.outlineButton]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={20} color={uiTokens.colors.textSecondary} />
            <Text style={styles.outlineButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

type CrashTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: CrashTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: uiTokens.colors.background,
      justifyContent: "center",
      alignItems: "center",
      padding: uiTokens.spacing["2xl"],
    },
    content: {
      width: "100%",
      maxWidth: 400,
      alignItems: "center",
    },
    iconContainer: {
      width: 100,
      height: 100,
      borderRadius: uiTokens.radius.full,
      backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.1),
      justifyContent: "center",
      alignItems: "center",
      marginBottom: uiTokens.spacing["2xl"],
    },
    title: {
      fontSize: 24,
      fontWeight: "700",
      color: uiTokens.colors.textPrimary,
      textAlign: "center",
      marginBottom: uiTokens.spacing.sm,
    },
    subtitle: {
      fontSize: 16,
      color: uiTokens.colors.textSecondary,
      textAlign: "center",
      marginBottom: uiTokens.spacing["2xl"],
    },
    errorBox: {
      width: "100%",
      backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.08),
      borderRadius: uiTokens.radius.lg,
      padding: uiTokens.spacing.md,
      marginBottom: uiTokens.spacing.md,
      borderWidth: 1,
      borderColor: colorWithAlpha(uiTokens.colors.error, 0.24),
    },
    errorLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: uiTokens.colors.error,
      marginBottom: uiTokens.spacing.xs,
      textTransform: "uppercase",
    },
    errorMessage: {
      fontSize: 14,
      color: uiTokens.colors.textPrimary,
      fontFamily: "monospace",
    },
    stackContainer: {
      width: "100%",
      maxHeight: 150,
      backgroundColor: uiTokens.colors.surface,
      borderRadius: uiTokens.radius.md,
      padding: uiTokens.spacing.md,
      marginBottom: uiTokens.spacing["2xl"],
    },
    stackTitle: {
      fontSize: 11,
      fontWeight: "600",
      color: uiTokens.colors.textMuted,
      marginBottom: uiTokens.spacing.sm,
      textTransform: "uppercase",
    },
    stack: {
      fontSize: 10,
      color: uiTokens.colors.textSecondary,
      fontFamily: "monospace",
    },
    actions: {
      width: "100%",
      gap: uiTokens.spacing.md,
    },
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: uiTokens.spacing.md,
      paddingHorizontal: uiTokens.spacing["2xl"],
      borderRadius: uiTokens.radius.lg,
      gap: uiTokens.spacing.sm,
      minHeight: 48,
    },
    primaryButton: {
      backgroundColor: uiTokens.colors.accent,
    },
    primaryButtonText: {
      color: uiTokens.colors.surface,
      fontSize: 16,
      fontWeight: "600",
    },
    secondaryButton: {
      backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.1),
    },
    secondaryButtonText: {
      color: uiTokens.colors.accent,
      fontSize: 16,
      fontWeight: "600",
    },
    outlineButton: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
    },
    outlineButtonText: {
      color: uiTokens.colors.textSecondary,
      fontSize: 16,
      fontWeight: "500",
    },
  });

export default StaffCrashScreen;
