/**
 * EmptyState Component - Empty state placeholder
 * Safe, non-breaking addition for empty states
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useUiTokens } from "@/hooks/useUiTokens";
import { ModernButton } from "./ModernButton";
import { getDecorativeIconProps } from "@/utils/accessibility";
import { FadeIn } from "./FadeIn";
import { font, gap, radius } from '@/theme/staffUiScale';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: object;
  accessibilityLabel?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = "document-outline",
  title,
  message,
  actionLabel,
  onAction,
  style,
  accessibilityLabel,
}) => {
  const uiTokens = useUiTokens();

  return (
    <FadeIn style={[styles.container, style]}>
      <View
        accessible={true}
        accessibilityLabel={accessibilityLabel || `${title}. ${message || ""}`}
      >
        <Ionicons
          name={icon}
          size={64}
          color={uiTokens.colors.textSecondary}
          style={styles.icon}
          {...getDecorativeIconProps()}
        />
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: uiTokens.colors.textPrimary }]}
        >
          {title}
        </Text>
        {!!message && (
          <Text style={[styles.message, { color: uiTokens.colors.textSecondary }]}>{message}</Text>
        )}
      </View>

      {actionLabel && onAction && (
        <View style={styles.actionContainer}>
          <ModernButton
            title={actionLabel}
            onPress={onAction}
            variant="primary"
            style={styles.actionButton}
          />
        </View>
      )}
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: gap["3xl"],
  },
  icon: {
    marginBottom: 16,
    opacity: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
  },
  actionContainer: {
    width: "100%",
    maxWidth: 300,
  },
  actionButton: {
    width: "100%",
  },
});
