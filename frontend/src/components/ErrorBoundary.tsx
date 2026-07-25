/**
 * Error Boundary Component
 * Catches and handles React component errors
 */

import React, { ReactNode, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";
import { errorReporter } from "../services/errorRecovery";
import { ModernButton } from "./ui/ModernButton";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { font, gap, radius } from "@/theme/staffUiScale";
import type { ThemeTokens } from "@/theme/themeTokens";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, resetError: () => void) => ReactNode;
}

const ErrorFallback = ({
  error,
  resetErrorBoundary,
}: {
  error: any;
  resetErrorBoundary: () => void;
}) => {
  const tokens = useUiTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  useEffect(() => {
    try {
      if (errorReporter && typeof errorReporter.report === "function") {
        errorReporter.report(error, "ErrorBoundary");
      }
    } catch (reportError) {
      console.error("Error reporting failed:", reportError);
    }
  }, [error]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconContainer}>
          <Ionicons name="alert-circle-outline" size={80} color={tokens.colors.error} />
        </View>

        <Text style={styles.title}>Application Recovery Required</Text>

        <Text style={styles.message}>
          {error?.message ||
            "This screen failed before it could finish rendering. Retry the action; if it fails again, return to the previous workflow and report the screen name."}
        </Text>

        {__DEV__ && error && (
          <View style={styles.details}>
            <Text style={styles.detailsTitle}>Error Details:</Text>
            <Text style={styles.detailsText}>{error.toString()}</Text>
          </View>
        )}

        <View style={styles.buttonContainer}>
          <ModernButton
            title="Try Again"
            onPress={resetErrorBoundary}
            variant="primary"
            size="medium"
            icon="refresh-outline"
          />
        </View>
      </ScrollView>
    </View>
  );
};

export const ErrorBoundary = ({ children, fallback }: Props) => {
  return (
    <ReactErrorBoundary
      fallbackRender={
        fallback
          ? ({ error, resetErrorBoundary }) => fallback(error as Error, resetErrorBoundary)
          : (props) => <ErrorFallback {...props} />
      }
    >
      {children}
    </ReactErrorBoundary>
  );
};

const createStyles = (tokens: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.colors.background,
    },
    content: {
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: gap["2xl"],
    },
    iconContainer: {
      marginBottom: gap.lg,
      padding: gap.lg,
      backgroundColor: colorWithAlpha(tokens.colors.error, 0.1),
      borderRadius: 50,
    },
    title: {
      fontSize: font.size.xl,
      fontWeight: font.weight.bold,
      color: tokens.colors.textPrimary,
      marginBottom: gap.sm,
      textAlign: "center",
    },
    message: {
      fontSize: font.size.lg,
      fontWeight: font.weight.regular,
      color: tokens.colors.textSecondary,
      textAlign: "center",
      marginBottom: gap.xl,
      paddingHorizontal: gap.md,
    },
    details: {
      width: "100%",
      padding: gap.md,
      backgroundColor: tokens.colors.surface,
      borderRadius: radius.lg,
      marginBottom: gap.xl,
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    detailsTitle: {
      fontSize: font.size.base,
      fontWeight: font.weight.bold,
      color: tokens.colors.textPrimary,
      marginBottom: gap.xs,
    },
    detailsText: {
      fontSize: font.size.sm,
      fontWeight: font.weight.regular,
      color: tokens.colors.textSecondary,
      fontFamily: "monospace",
      marginBottom: gap.xs,
    },
    buttonContainer: {
      width: "100%",
      maxWidth: 300,
    },
  });
