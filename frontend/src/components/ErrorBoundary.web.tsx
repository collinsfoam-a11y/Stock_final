import React, { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";

import { errorReporter } from "../services/errorRecovery";

import { colors as uiColors, semanticColors as uiSemanticColors } from "@/theme/legacyCompat";
interface Props {
  children: ReactNode;
  fallback?: (error: Error, resetError: () => void) => ReactNode;
}

const ErrorFallback = ({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) => {
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
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Error</Text>
        </View>
        <Text style={styles.title}>Application Recovery Required</Text>
        <Text style={styles.message}>
          {error?.message ||
            "This screen failed before it could finish rendering. Retry the action; if it fails again, return to the previous workflow and report the screen name."}
        </Text>
        {__DEV__ ? <Text style={styles.details}>{error.toString()}</Text> : null}
        <Pressable
          onPress={resetErrorBoundary}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
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
          : (props) => <ErrorFallback {...(props as any)} />
      }
    >
      {children}
    </ReactErrorBoundary>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: uiColors.neutral[50],
  },
  content: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: uiColors.error[100],
    marginBottom: 18,
  },
  badgeText: {
    color: uiColors.error[800],
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: uiColors.neutral[900],
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: uiColors.neutral[600],
    textAlign: "center",
    maxWidth: 520,
    marginBottom: 16,
  },
  details: {
    fontSize: 13,
    lineHeight: 20,
    color: uiColors.error[900],
    backgroundColor: uiColors.error[50],
    borderRadius: 12,
    padding: 14,
    width: "100%",
    maxWidth: 620,
    marginBottom: 20,
  },
  button: {
    minHeight: 48,
    minWidth: 160,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiColors.secondary[700],
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    color: uiSemanticColors.text.inverse,
    fontSize: 15,
    fontWeight: "700",
  },
});
