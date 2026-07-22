import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { font, radius, gap } from "@/theme/staffUiScale";
import { useUiTokens } from "@/hooks/useUiTokens";

export interface HistoryStateViewProps {
  loading: boolean;
  loadError: string | null;
  loadWarning: string | null;
  isEmpty: boolean;
  onRetry: () => void;
}

/**
 * HistoryStateView - Extracted state handling (loading, error, warning, empty)
 * Returns null when the list should render normally
 */
export default function HistoryStateView({
  loading,
  loadError,
  loadWarning,
  isEmpty,
  onRetry,
}: HistoryStateViewProps) {
  const uiTokens = useUiTokens();

  if (loading && !isEmpty) {
    // Show loading skeleton
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.skeletonItem}>
          <View style={[styles.skeletonBox, styles.skeletonLine]} />
          <View style={[styles.skeletonBox, styles.skeletonText]} />
        </View>
        <View style={styles.skeletonItem}>
          <View style={[styles.skeletonBox, styles.skeletonLine]} />
          <View style={[styles.skeletonBox, styles.skeletonText]} />
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={44} color={uiTokens.colors.error} />
        <Text style={[styles.errorTitle, { color: uiTokens.colors.textPrimary }]}>
          Count history unavailable
        </Text>
        <Text style={[styles.errorBody, { color: uiTokens.colors.textSecondary }]}>
          Could not load this session's count lines. Reason: {loadError} Pull down to
          refresh or retry now.
        </Text>
        <TouchableOpacity
          style={[
            styles.retryButton,
            {
              backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.12),
              borderColor: colorWithAlpha(uiTokens.colors.error, 0.34),
            },
          ]}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading count history"
        >
          <Ionicons name="refresh" size={18} color={uiTokens.colors.error} />
          <Text style={[styles.retryButtonText, { color: uiTokens.colors.error }]}>
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loadWarning) {
    return (
      <View
        style={[
          styles.warningContainer,
          {
            backgroundColor: colorWithAlpha(uiTokens.colors.warning, 0.08),
            borderColor: colorWithAlpha(uiTokens.colors.warning, 0.28),
          },
        ]}
        testID="history-load-warning"
      >
        <Ionicons name="warning-outline" size={20} color={uiTokens.colors.warning} />
        <Text style={[styles.warningText, { color: uiTokens.colors.textSecondary }]}>
          {loadWarning}
        </Text>
        <TouchableOpacity
          style={styles.warningRetry}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry live history refresh"
        >
          <Ionicons name="refresh" size={18} color={uiTokens.colors.warning} />
        </TouchableOpacity>
      </View>
    );
  }

  if (isEmpty) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="file-tray-outline" size={64} color={uiTokens.colors.textMuted} />
        <Text style={[styles.emptyText, { color: uiTokens.colors.textSecondary }]}>
          {loading ? "Loading..." : "No counts yet"}
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  loadingContainer: { padding: 16 },
  skeletonItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: gap.md,
    marginBottom: gap.md,
  },
  skeletonBox: {
    backgroundColor: "#e0e0e0",
    borderRadius: radius.sm,
  },
  skeletonLine: { width: 48, height: 32 },
  skeletonText: { width: 60, height: 12 },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 48,
    marginHorizontal: gap.lg,
    padding: gap.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  errorTitle: {
    marginTop: gap.md,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold,
    textAlign: "center",
  },
  errorBody: {
    marginTop: gap.sm,
    fontSize: font.size.sm,
    lineHeight: font.leading.normal,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 44,
    marginTop: gap.lg,
    paddingHorizontal: gap.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: gap.sm,
  },
  retryButtonText: {
    fontSize: font.size.base,
    fontWeight: font.weight.bold,
  },
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: gap.sm,
    marginBottom: gap.md,
    padding: gap.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  warningText: {
    flex: 1,
    fontSize: font.size.caption,
    lineHeight: font.leading.snug,
    fontWeight: font.weight.medium,
  },
  warningRetry: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    minHeight: 44,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: font.size.md,
    marginTop: gap.lg,
    fontWeight: font.weight.medium,
  },
});

function colorWithAlpha(color: string, alpha: number): string {
  // Simple hex to rgba conversion
  const hex = color.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
