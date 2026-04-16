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
import {
  modernColors,
  modernTypography,
  modernSpacing,
} from "../styles/modernDesignSystem";
import { PremiumButton } from "./premium/PremiumButton";

interface Props {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
}

const ErrorFallback = ({
  error,
  resetErrorBoundary,
}: {
  error: any;
  resetErrorBoundary: () => void;
}) => {
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
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconContainer}>
          <Ionicons
            name="alert-circle-outline"
            size={80}
            color={modernColors.error.main}
          />
        </View>

        <Text style={styles.title}>Something went wrong</Text>

        <Text style={styles.message}>
          {error?.message || "An unexpected error occurred"}
        </Text>

        {__DEV__ && error && (
          <View style={styles.details}>
            <Text style={styles.detailsTitle}>Error Details:</Text>
            <Text style={styles.detailsText}>{error.toString()}</Text>
          </View>
        )}

        <View style={styles.buttonContainer}>
          <PremiumButton
            title="Try Again"
            onPress={resetErrorBoundary}
            variant="primary"
            size="medium"
            icon="refresh-outline"
            gradientColors={[...modernColors.gradients.primary]}
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
          ? ({ error }) => fallback(error as Error)
          : (props) => <ErrorFallback {...props} />
      }
    >
      {children}
    </ReactErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: modernColors.background.default,
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
    backgroundColor: "rgba(255, 82, 82, 0.1)", // Light red background
    borderRadius: 50,
  },
  title: {
    ...modernTypography.h2,
    color: modernColors.text.primary,
    marginBottom: modernSpacing.md,
    textAlign: "center",
  },
  message: {
    ...modernTypography.body.large,
    color: modernColors.text.secondary,
    textAlign: "center",
    marginBottom: modernSpacing.xl,
    paddingHorizontal: modernSpacing.md,
  },
  details: {
    width: "100%",
    padding: modernSpacing.md,
    backgroundColor: modernColors.background.paper,
    borderRadius: 12,
    marginBottom: modernSpacing.xl,
    borderWidth: 1,
    borderColor: modernColors.border.light,
  },
  detailsTitle: {
    ...modernTypography.h4,
    color: modernColors.text.primary,
    marginBottom: modernSpacing.sm,
  },
  detailsText: {
    ...modernTypography.body.small,
    color: modernColors.text.secondary,
    fontFamily: "monospace",
    marginBottom: modernSpacing.xs,
  },
  buttonContainer: {
    width: "100%",
    maxWidth: 300,
  },
});
