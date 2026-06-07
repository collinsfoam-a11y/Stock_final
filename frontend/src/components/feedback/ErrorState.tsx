/**
 * ErrorState Component
 * Displays error messages with retry functionality and helpful guidance
 *
 * Features:
 * - Multiple error type icons (network, validation, server, general)
 * - Retry button with loading state
 * - Accessibility labels for screen readers
 * - Responsive design for mobile and web
 * - Customizable error messages and actions
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { View, Text, StyleSheet, ViewStyle, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ModernButton } from "../ui/ModernButton";
import {
  modernColors,
  modernTypography,
  modernSpacing,
  modernBorderRadius,
} from "../../styles/unifiedSystem";

export type ErrorType = "network" | "validation" | "server" | "general";

interface ErrorStateProps {
  /** Error type determines icon and message tone */
  type?: ErrorType;
  /** Main error message */
  title: string;
  /** Detailed error description (optional) */
  description?: string;
  /** Retry button action */
  onRetry?: () => void;
  /** Additional action button */
  onSecondaryAction?: () => void;
  /** Secondary action label */
  secondaryActionLabel?: string;
  /** Show loading state on retry button */
  isRetrying?: boolean;
  /** Custom container style */
  style?: ViewStyle;
  /** Dismiss action */
  onDismiss?: () => void;
  /** Show dismiss button */
  showDismiss?: boolean;
  /** Technical error details (for debugging) */
  details?: string;
}

const getErrorConfig = (type: ErrorType) => {
  const configs: Record<ErrorType, { icon: string; color: string }> = {
    network: {
      icon: "wifi-off",
      color: modernColors.warning.main,
    },
    validation: {
      icon: "alert-circle",
      color: modernColors.error.main,
    },
    server: {
      icon: "server",
      color: modernColors.error.main,
    },
    general: {
      icon: "alert",
      color: modernColors.error.main,
    },
  };
  return configs[type];
};

export const ErrorState: React.FC<ErrorStateProps> = ({
  type = "general",
  title,
  description,
  onRetry,
  onSecondaryAction,
  secondaryActionLabel,
  isRetrying = false,
  style,
  onDismiss,
  showDismiss = true,
  details,
}) => {
  const { t } = useTranslation();
  const resolvedSecondaryLabel = secondaryActionLabel ?? t("common.back");
  const config = getErrorConfig(type);

  return (
    <ScrollView
      style={[styles.container, style]}
      contentContainerStyle={styles.content}
      scrollEnabled={!!description && description.length > 100}
      accessibilityRole="alert"
      accessible={true}
    >
      {/* Error Icon */}
      <View style={styles.iconContainer}>
        <Ionicons
          name={config.icon as any}
          size={64}
          color={config.color}
          accessibilityHidden={true}
        />
      </View>

      {/* Error Title */}
      <Text
        style={[styles.title, { color: config.color }]}
        accessibilityRole="header"
        accessibilityLabel={`Error: ${title}`}
      >
        {title}
      </Text>

      {/* Error Description */}
      {description && (
        <Text style={styles.description} accessibilityLiveRegion="polite">
          {description}
        </Text>
      )}

      {/* Technical Details (Dev Only) */}
      {__DEV__ && details && (
        <View style={styles.detailsBox}>
          <Text style={styles.detailsLabel}>{t("errors.technicalDetails")}</Text>
          <Text style={styles.detailsText}>{details}</Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.buttonsContainer}>
        {onRetry && (
          <ModernButton
            title={isRetrying ? t("common.retrying") : t("common.retry")}
            onPress={onRetry}
            disabled={isRetrying}
            loading={isRetrying}
            variant="primary"
            fullWidth={true}
            accessibilityLabel={`${t("common.retry")}: ${title}`}
            testID="error-retry-button"
          />
        )}

        {onSecondaryAction && (
          <ModernButton
            title={resolvedSecondaryLabel}
            onPress={onSecondaryAction}
            variant="outline"
            fullWidth={true}
            style={styles.secondaryButton}
            accessibilityLabel={resolvedSecondaryLabel}
            testID="error-secondary-button"
          />
        )}

        {showDismiss && onDismiss && (
          <ModernButton
            title={t("common.dismiss")}
            onPress={onDismiss}
            variant="ghost"
            fullWidth={true}
            style={styles.dismissButton}
            accessibilityLabel={t("errorState.dismissLabel")}
            testID="error-dismiss-button"
          />
        )}
      </View>

      {/* Help Text */}
      {type === "network" && (
        <Text style={styles.helpText} accessibilityLiveRegion="polite">
          {t("errors.network")}
        </Text>
      )}

      {type === "server" && (
        <Text style={styles.helpText} accessibilityLiveRegion="polite">
          {t("errors.server")}
        </Text>
      )}

      {type === "validation" && (
        <Text style={styles.helpText} accessibilityLiveRegion="polite">
          {t("errors.validation")}
        </Text>
      )}
    </ScrollView>
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
    paddingHorizontal: modernSpacing.lg,
    paddingVertical: modernSpacing.xl,
    minHeight: 300,
  },
  iconContainer: {
    marginBottom: modernSpacing.xl,
  },
  title: {
    ...modernTypography.h2,
    marginBottom: modernSpacing.md,
    textAlign: "center",
  },
  description: {
    ...modernTypography.body,
    color: modernColors.text.secondary,
    textAlign: "center",
    marginBottom: modernSpacing.xl,
  },
  detailsBox: {
    backgroundColor: modernColors.error.light,
    borderRadius: modernBorderRadius.md,
    padding: modernSpacing.md,
    marginBottom: modernSpacing.xl,
    borderLeftWidth: 4,
    borderLeftColor: modernColors.error.main,
  },
  detailsLabel: {
    ...modernTypography.label.small,
    fontWeight: "600" as const,
    color: modernColors.error.main,
    marginBottom: modernSpacing.sm,
  },
  detailsText: {
    ...modernTypography.label.small,
    color: modernColors.text.primary,
    fontFamily: "monospace",
  },
  buttonsContainer: {
    width: "100%",
    gap: modernSpacing.md,
  },
  secondaryButton: {
    marginTop: modernSpacing.md,
  },
  dismissButton: {
    marginTop: modernSpacing.sm,
  },
  helpText: {
    ...modernTypography.label.small,
    color: modernColors.text.secondary,
    textAlign: "center",
    marginTop: modernSpacing.lg,
    fontStyle: "italic",
  },
});
