/**
 * SafeView Component - Safe wrapper with error boundary
 * Prevents crashes by catching errors in children
 */

import React, { ReactNode } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { ErrorBoundary } from "../ErrorBoundary";
import { useUiTokens } from "@/hooks/useUiTokens";

interface SafeViewProps {
  children: ReactNode;
  style?: ViewStyle;
  fallback?: (error: Error) => ReactNode;
}

export const SafeView: React.FC<SafeViewProps> = ({ children, style, fallback }) => {
  const uiTokens = useUiTokens();

  const defaultFallback = (_error: Error) => (
    <View style={[styles.errorContainer, { backgroundColor: uiTokens.colors.background }]}>
      <ErrorBoundary fallback={fallback}>{children}</ErrorBoundary>
    </View>
  );

  return (
    <ErrorBoundary fallback={fallback || defaultFallback}>
      <View style={[styles.container, { backgroundColor: uiTokens.colors.background }, style]}>
        {children}
      </View>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
  },
});