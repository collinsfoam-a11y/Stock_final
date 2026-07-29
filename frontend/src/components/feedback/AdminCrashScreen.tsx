/**
 * AdminCrashScreen Component
 *
 * Fallback UI for ErrorBoundary in admin layouts.
 * Provides a recovery path when admin screens crash.
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getAccessibleButtonProps } from "@/utils/accessibility";

import { AppTouchable } from "@/components/ui/AppTouchable";

interface AdminCrashScreenProps {
  error: Error;
  resetError: () => void;
}

export const AdminCrashScreen: React.FC<AdminCrashScreenProps> = ({ error, resetError }) => {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);

  const handleGoHome = () => {
    resetError();
    router.replace("/admin");
  };

  const handleLogout = () => {
    resetError();
    router.replace("/welcome" as any);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="warning-outline" size={64} color={uiTokens.colors.error} />
        </View>

        <Text style={styles.title}>Admin Panel Error</Text>
        <Text style={styles.subtitle}>
          The admin interface stopped before the requested screen could finish rendering.
        </Text>

        <View style={styles.errorBox}>
          <Text style={styles.errorLabel}>Error Details:</Text>
          <Text style={styles.errorMessage}>
            {error.message ||
              "The admin screen failed before technical details were available. Retry, or return to the dashboard and report this screen."}
          </Text>
        </View>

        {__DEV__ && error.stack && (
          <ScrollView style={styles.stackContainer}>
            <Text style={styles.stackTitle}>Stack Trace (Dev Only):</Text>
            <Text style={styles.stack}>{error.stack}</Text>
          </ScrollView>
        )}

        <View style={styles.actions}>
          <AppTouchable
            {...getAccessibleButtonProps({ label: "Retry loading admin panel" })}
            style={[styles.button, styles.primaryButton]}
            onPress={resetError}
            accessibilityLabel="Refresh">
            <Ionicons name="refresh" size={20} color={uiTokens.colors.surface} />
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </AppTouchable>

          <AppTouchable
            {...getAccessibleButtonProps({ label: "Return to admin dashboard" })}
            style={[styles.button, styles.secondaryButton]}
            onPress={handleGoHome}
            accessibilityLabel="Home">
            <Ionicons name="home-outline" size={20} color={uiTokens.colors.accent} />
            <Text style={styles.secondaryButtonText}>Go to Dashboard</Text>
          </AppTouchable>

          <AppTouchable
            {...getAccessibleButtonProps({ label: "Log out after admin panel error" })}
            style={[styles.button, styles.outlineButton]}
            onPress={handleLogout}
            accessibilityLabel="Log out">
            <Ionicons name="log-out-outline" size={20} color={uiTokens.colors.textSecondary} />
            <Text style={styles.outlineButtonText}>Logout</Text>
          </AppTouchable>
        </View>

        <Text style={styles.helpText}>
          If this issue persists, please contact your system administrator.
        </Text>
      </View>
    </View>
  );
};

type CrashTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: CrashTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: uiTokens.colors.background,
      padding: uiTokens.spacing["2xl"],
    },
    content: {
      maxWidth: 480,
      width: "100%",
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
      marginBottom: uiTokens.spacing.sm,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 16,
      color: uiTokens.colors.textSecondary,
      marginBottom: uiTokens.spacing["2xl"],
      textAlign: "center",
    },
    errorBox: {
      width: "100%",
      backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.08),
      borderRadius: uiTokens.radius.lg,
      borderWidth: 1,
      borderColor: colorWithAlpha(uiTokens.colors.error, 0.24),
      padding: uiTokens.spacing.lg,
      marginBottom: uiTokens.spacing["2xl"],
    },
    errorLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: uiTokens.colors.error,
      marginBottom: uiTokens.spacing.sm,
      textTransform: "uppercase",
    },
    errorMessage: {
      fontSize: 14,
      color: uiTokens.colors.textPrimary,
      fontFamily: "monospace",
    },
    stackContainer: {
      maxHeight: 150,
      width: "100%",
      backgroundColor: uiTokens.colors.surface,
      borderRadius: uiTokens.radius.md,
      padding: uiTokens.spacing.md,
      marginBottom: uiTokens.spacing["2xl"],
    },
    stackTitle: {
      fontSize: 12,
      fontWeight: "600",
      color: uiTokens.colors.textSecondary,
      marginBottom: uiTokens.spacing.sm,
    },
    stack: {
      fontSize: 10,
      color: uiTokens.colors.textMuted,
      fontFamily: "monospace",
    },
    actions: {
      width: "100%",
      gap: uiTokens.spacing.md,
      marginBottom: uiTokens.spacing["2xl"],
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
    helpText: {
      fontSize: 12,
      color: uiTokens.colors.textMuted,
      textAlign: "center",
    },
  });

