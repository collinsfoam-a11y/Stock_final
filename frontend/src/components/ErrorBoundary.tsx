/**
 * Error Boundary Component
 * Catches and handles React component errors
 * Enhanced with modern design system support
 */

import React, { ReactNode } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";
import { errorReporter } from "../services/errorRecovery";
import { modernTypography, modernSpacing } from "../styles/modernDesignSystem";
import { AppButton } from "./ui/AppButton";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";

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
  const styles = React.useMemo(() => createStyles(tokens), [tokens]);
  // Report error when component mounts
  React.useEffect(() => {
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
          <AppButton
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

const createStyles = (tokens: ThemeTokens) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: modernSpacing.xl,
  },
  iconContainer: {
    marginBottom: modernSpacing.lg,
    padding: modernSpacing.lg,
    backgroundColor: colorWithAlpha(tokens.colors.error, 0.1),
    borderRadius: 50,
  },
  title: {
    ...modernTypography.h2,
    color: tokens.colors.textPrimary,
    marginBottom: modernSpacing.md,
    textAlign: "center",
  },
  message: {
    ...modernTypography.body.large,
    color: tokens.colors.textSecondary,
    textAlign: "center",
    marginBottom: modernSpacing.xl,
    paddingHorizontal: modernSpacing.md,
  },
  details: {
    width: "100%",
    padding: modernSpacing.md,
    backgroundColor: tokens.colors.surface,
    borderRadius: 12,
    marginBottom: modernSpacing.xl,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  detailsTitle: {
    ...modernTypography.h4,
    color: tokens.colors.textPrimary,
    marginBottom: modernSpacing.sm,
  },
  detailsText: {
    ...modernTypography.body.small,
    color: tokens.colors.textSecondary,
    fontFamily: "monospace",
    marginBottom: modernSpacing.xs,
  },
  buttonContainer: {
    width: "100%",
    maxWidth: 300,
  },
});
