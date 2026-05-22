import React, { memo, useEffect, useMemo } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import {
  OPERATIONAL_TELEMETRY_EVENT_REGISTRY,
  operationalTelemetry,
} from "@/services/observability/operationalTelemetry";
import {
  OPERATIONAL_SEVERITY_REGISTRY,
  getOperationalToneColor,
  type OperationalSeverityLevel,
  type OperationalToneToken,
} from "@/theme/operationalSeverity";
import {
  getAccessibleButtonProps,
  getDecorativeIconProps,
  getMinimumTouchTargetStyle,
} from "@/utils/accessibility";

export type ScannerFeedbackStateValue =
  | ""
  | "idle"
  | "scanning"
  | "captured"
  | "processing"
  | "found"
  | "success"
  | "queued"
  | "duplicate"
  | "warning"
  | "offline"
  | "not_found"
  | "invalid"
  | "blocked"
  | "error";

export type ScannerFeedbackAction = {
  label?: string;
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export interface ScannerFeedbackStateProps {
  state: ScannerFeedbackStateValue;
  item?: string | null;
  barcode?: string | null;
  timestamp?: string | number | Date | null;
  retry?: ScannerFeedbackAction | null;
  dismiss?: ScannerFeedbackAction | null;
  compact?: boolean;
  title?: string;
  message?: string;
  metadata?: string | string[];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

type StateConfig = {
  tone: OperationalToneToken;
  severity: OperationalSeverityLevel;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  title: string;
};

const STATE_CONFIG: Record<Exclude<ScannerFeedbackStateValue, "">, StateConfig> = {
  idle: {
    tone: "neutral",
    severity: "info",
    icon: "scan-outline",
    label: "Ready",
    title: "Scanner ready",
  },
  scanning: {
    tone: "info",
    severity: "info",
    icon: "scan-outline",
    label: "Scanning",
    title: "Scanning",
  },
  captured: {
    tone: "info",
    severity: "pending",
    icon: "barcode-outline",
    label: "Captured",
    title: "Scan captured",
  },
  processing: {
    tone: "info",
    severity: "pending",
    icon: "sync-outline",
    label: "Checking",
    title: "Checking scan",
  },
  found: {
    tone: "success",
    severity: "success",
    icon: "checkmark-circle-outline",
    label: "Found",
    title: "Item ready",
  },
  success: {
    tone: "success",
    severity: "success",
    icon: "checkmark-circle-outline",
    label: "Success",
    title: "Scan accepted",
  },
  queued: {
    tone: "success",
    severity: "pending",
    icon: "cloud-upload-outline",
    label: "Queued",
    title: "Scan queued",
  },
  duplicate: {
    tone: "warning",
    severity: "warning",
    icon: "copy-outline",
    label: "Duplicate",
    title: "Duplicate scan",
  },
  warning: {
    tone: "warning",
    severity: "warning",
    icon: "warning-outline",
    label: "Attention",
    title: "Check scan",
  },
  offline: {
    tone: "warning",
    severity: "offline",
    icon: "cloud-offline-outline",
    label: "Offline",
    title: "Offline scan state",
  },
  not_found: {
    tone: "warning",
    severity: "warning",
    icon: "search-outline",
    label: "No match",
    title: "Item not found",
  },
  invalid: {
    tone: "error",
    severity: "critical",
    icon: "alert-circle-outline",
    label: "Invalid",
    title: "Barcode not accepted",
  },
  blocked: {
    tone: "error",
    severity: "blocked",
    icon: "lock-closed-outline",
    label: "Blocked",
    title: "Scan blocked",
  },
  error: {
    tone: "error",
    severity: "critical",
    icon: "close-circle-outline",
    label: "Error",
    title: "Scan failed",
  },
};

const normalizeMetadata = (metadata?: string | string[]) => {
  if (!metadata) return [];
  return Array.isArray(metadata) ? metadata.filter(Boolean) : [metadata].filter(Boolean);
};

const formatTimestamp = (timestamp: ScannerFeedbackStateProps["timestamp"]) => {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return timestamp.toLocaleString();
  if (typeof timestamp === "number") return new Date(timestamp).toLocaleString();
  return timestamp;
};

const buildAccessibilityLabel = ({
  config,
  title,
  message,
  item,
  barcode,
  timestampLabel,
  metadata,
}: {
  config: StateConfig;
  title: string;
  message?: string;
  item?: string | null;
  barcode?: string | null;
  timestampLabel?: string | null;
  metadata: string[];
}) =>
  [
    config.label,
    title,
    message,
    item ? `Item ${item}` : null,
    barcode ? `Barcode ${barcode}` : null,
    timestampLabel ? `Time ${timestampLabel}` : null,
    ...metadata,
  ]
    .filter(Boolean)
    .join(". ");

const createStyles = (tokens: ThemeTokens, toneColor: string, compact: boolean) =>
  StyleSheet.create({
    container: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: colorWithAlpha(toneColor, tokens.mode === "dark" ? 0.46 : 0.32),
      backgroundColor: colorWithAlpha(toneColor, tokens.mode === "dark" ? 0.16 : 0.08),
      paddingHorizontal: compact ? tokens.spacing.sm : tokens.spacing.md,
      paddingVertical: compact ? tokens.spacing.xs : tokens.spacing.sm,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: tokens.spacing.xs,
    },
    iconWrap: {
      width: compact ? 30 : 36,
      height: compact ? 30 : 36,
      borderRadius: tokens.radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colorWithAlpha(toneColor, tokens.mode === "dark" ? 0.24 : 0.12),
    },
    content: {
      flex: 1,
      minWidth: 0,
      gap: tokens.spacing.xs,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: compact ? 13 : 15,
      lineHeight: compact ? 18 : 20,
      fontWeight: "800",
    },
    statePill: {
      borderRadius: tokens.radius.full,
      backgroundColor: colorWithAlpha(toneColor, tokens.mode === "dark" ? 0.3 : 0.14),
      paddingHorizontal: tokens.spacing.xs,
      paddingVertical: tokens.spacing.xxs,
    },
    stateText: {
      color: toneColor,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    message: {
      color: tokens.colors.textSecondary,
      fontSize: compact ? 12 : 13,
      lineHeight: compact ? 17 : 19,
      fontWeight: "600",
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: tokens.spacing.xs,
    },
    metaChip: {
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: colorWithAlpha(toneColor, tokens.mode === "dark" ? 0.34 : 0.22),
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.xs,
      paddingVertical: tokens.spacing.xxs,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xxs,
      maxWidth: "100%",
    },
    metaText: {
      color: tokens.colors.textSecondary,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "700",
    },
    barcodeText: {
      fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
      letterSpacing: 0,
    },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
      flexShrink: 0,
    },
    actionButton: {
      ...getMinimumTouchTargetStyle(compact ? 44 : 48),
      borderRadius: tokens.radius.md,
      paddingHorizontal: compact ? tokens.spacing.sm : tokens.spacing.md,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: tokens.spacing.xs,
      borderWidth: 1,
    },
    retryButton: {
      backgroundColor: toneColor,
      borderColor: toneColor,
    },
    retryText: {
      color: tokens.colors.surface,
      fontSize: 12,
      fontWeight: "800",
    },
    dismissButton: {
      backgroundColor: tokens.colors.surface,
      borderColor: tokens.colors.border,
    },
    dismissText: {
      color: tokens.colors.textSecondary,
      fontSize: 12,
      fontWeight: "800",
    },
    actionPressed: {
      opacity: 0.82,
    },
    actionDisabled: {
      opacity: 0.52,
    },
  });

function ScannerFeedbackStateComponent({
  state,
  item,
  barcode,
  timestamp,
  retry,
  dismiss,
  compact = false,
  title,
  message,
  metadata,
  style,
  testID,
}: ScannerFeedbackStateProps) {
  const tokens = useUiTokens();
  const normalizedState = state || "";
  const config = normalizedState ? STATE_CONFIG[normalizedState] : null;
  const styleConfig = config || STATE_CONFIG.idle;
  const severityDefinition = OPERATIONAL_SEVERITY_REGISTRY[styleConfig.severity];
  const metadataItems = normalizeMetadata(metadata);
  const timestampLabel = formatTimestamp(timestamp);
  const toneColor = getOperationalToneColor(tokens, severityDefinition.tone || styleConfig.tone);
  const styles = useMemo(
    () => createStyles(tokens, toneColor, compact),
    [tokens, toneColor, compact]
  );
  const decorativeIconProps = getDecorativeIconProps();
  const resolvedTitle = title || styleConfig.title;
  const retryDisabled = Boolean(retry?.disabled || retry?.busy);
  const showRetry = Boolean(retry?.onPress);
  const showDismiss = Boolean(dismiss?.onPress);
  const accessibilityLabel = buildAccessibilityLabel({
    config: styleConfig,
    title: resolvedTitle,
    message,
    item,
    barcode,
    timestampLabel,
    metadata: metadataItems,
  });
  const role = styleConfig.tone === "error" ? "alert" : "text";

  useEffect(() => {
    if (!config) return;
    operationalTelemetry.trackScanner(
      OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SCAN_FEEDBACK_VISIBLE,
      config.severity === "critical"
        ? "failure"
        : normalizedState === "duplicate"
          ? "duplicate"
          : normalizedState === "invalid"
            ? "invalid"
            : normalizedState === "not_found"
              ? "not_found"
              : normalizedState === "offline"
                ? "offline"
                : "success",
      {
        state: normalizedState,
        item,
        barcode,
        hasRetry: showRetry,
        hasDismiss: showDismiss,
        compact,
        surface: testID || "scanner_feedback_state",
      }
    );
  }, [
    barcode,
    compact,
    config,
    item,
    normalizedState,
    showDismiss,
    showRetry,
    testID,
  ]);

  if (!config) return null;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion={config.tone === "error" ? "assertive" : "polite"}
      accessibilityRole={role}
      style={[styles.container, style]}
      testID={testID}
    >
      <View style={styles.iconWrap}>
        {normalizedState === "processing" ? (
          <ActivityIndicator size="small" color={toneColor} />
        ) : (
          <Ionicons
            {...decorativeIconProps}
            name={config.icon || severityDefinition.icon}
            size={compact ? 18 : 22}
            color={toneColor}
          />
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={compact ? 1 : 2}>
            {resolvedTitle}
          </Text>
          <View style={styles.statePill}>
            <Text style={styles.stateText}>{config.label}</Text>
          </View>
        </View>

        {message ? (
          <Text style={styles.message} numberOfLines={compact ? 2 : 4}>
            {message}
          </Text>
        ) : null}

        {item || barcode || timestampLabel || metadataItems.length > 0 ? (
          <View style={styles.metaRow}>
            {item ? (
              <View style={styles.metaChip}>
                <Ionicons
                  {...decorativeIconProps}
                  name="cube-outline"
                  size={13}
                  color={tokens.colors.textMuted}
                />
                <Text style={styles.metaText} numberOfLines={1}>
                  {item}
                </Text>
              </View>
            ) : null}
            {barcode ? (
              <View style={styles.metaChip}>
                <Ionicons
                  {...decorativeIconProps}
                  name="barcode-outline"
                  size={13}
                  color={tokens.colors.textMuted}
                />
                <Text style={[styles.metaText, styles.barcodeText]} numberOfLines={1}>
                  {barcode}
                </Text>
              </View>
            ) : null}
            {timestampLabel ? (
              <View style={styles.metaChip}>
                <Ionicons
                  {...decorativeIconProps}
                  name="time-outline"
                  size={13}
                  color={tokens.colors.textMuted}
                />
                <Text style={styles.metaText} numberOfLines={1}>
                  {timestampLabel}
                </Text>
              </View>
            ) : null}
            {metadataItems.map((value) => (
              <View key={value} style={styles.metaChip}>
                <Text style={styles.metaText} numberOfLines={1}>
                  {value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {showRetry || showDismiss ? (
        <View style={styles.actions}>
          {showRetry ? (
            <Pressable
              {...getAccessibleButtonProps({
                label: retry?.accessibilityLabel || retry?.label || "Retry scan action",
                hint: retry?.accessibilityHint || "Retries this scanner workflow action",
                disabled: retryDisabled,
                busy: retry?.busy,
              })}
              disabled={retryDisabled}
              onPress={retry?.onPress}
              style={({ pressed }) => [
                styles.actionButton,
                styles.retryButton,
                pressed ? styles.actionPressed : null,
                retryDisabled ? styles.actionDisabled : null,
              ]}
            >
              {retry?.busy ? (
                <ActivityIndicator size="small" color={tokens.colors.surface} />
              ) : (
                <Ionicons
                  {...decorativeIconProps}
                  name="refresh-outline"
                  size={16}
                  color={tokens.colors.surface}
                />
              )}
              {retry?.label ? <Text style={styles.retryText}>{retry.label}</Text> : null}
            </Pressable>
          ) : null}

          {showDismiss ? (
            <Pressable
              {...getAccessibleButtonProps({
                label: dismiss?.accessibilityLabel || dismiss?.label || "Dismiss scan message",
                hint: dismiss?.accessibilityHint || "Hides this scanner feedback message",
                disabled: dismiss?.disabled,
              })}
              disabled={dismiss?.disabled}
              onPress={dismiss?.onPress}
              style={({ pressed }) => [
                styles.actionButton,
                styles.dismissButton,
                pressed ? styles.actionPressed : null,
                dismiss?.disabled ? styles.actionDisabled : null,
              ]}
            >
              {dismiss?.label ? (
                <Text style={styles.dismissText}>{dismiss.label}</Text>
              ) : (
                <Ionicons
                  {...decorativeIconProps}
                  name="close"
                  size={16}
                  color={tokens.colors.textSecondary}
                />
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const ScannerFeedbackState = memo(ScannerFeedbackStateComponent);

export default ScannerFeedbackState;
