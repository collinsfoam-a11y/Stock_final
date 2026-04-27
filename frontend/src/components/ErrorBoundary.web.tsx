import React, { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";

import { errorReporter } from "../services/errorRecovery";

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
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          {error?.message || "An unexpected error occurred"}
        </Text>
        {__DEV__ ? <Text style={styles.details}>{error.toString()}</Text> : null}
        <Pressable
          onPress={resetErrorBoundary}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
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
          ? ({ error, resetErrorBoundary }) =>
              fallback(error as Error, resetErrorBoundary)
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
    backgroundColor: "#f4f7f6",
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
    backgroundColor: "#fee2e2",
    marginBottom: 18,
  },
  badgeText: {
    color: "#991b1b",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: "#475569",
    textAlign: "center",
    maxWidth: 520,
    marginBottom: 16,
  },
  details: {
    fontSize: 13,
    lineHeight: 20,
    color: "#7f1d1d",
    backgroundColor: "#fff1f2",
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
    backgroundColor: "#0f766e",
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
