import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import {
  getAccessibleButtonProps,
  getDecorativeIconProps,
  getMinimumTouchTargetStyle,
} from "@/utils/accessibility";

export type OperationalSyncTone =
  | "ready"
  | "info"
  | "offline"
  | "pending"
  | "syncing"
  | "warning"
  | "failed";

type ToneConfig = {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  stateLabel: string;
};

export interface OperationalSyncBannerProps {
  title: string;
  message?: string;
  tone?: OperationalSyncTone;
  pendingCount?: number;
  lastSyncLabel?: string | null;
  actionLabel?: string;
  actionHint?: string;
  onActionPress?: () => void;
  actionDisabled?: boolean;
  actionBusy?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const getToneConfig = (tone: OperationalSyncTone, tokens: ThemeTokens): ToneConfig => {
  switch (tone) {
    case "ready":
      return {
        color: tokens.colors.success,
        icon: "checkmark-circle-outline",
        stateLabel: "Ready",
      };
    case "offline":
      return {
        color: tokens.colors.warning,
        icon: "cloud-offline-outline",
        stateLabel: "Offline",
      };
    case "pending":
      return {
        color: tokens.colors.warning,
        icon: "cloud-upload-outline",
        stateLabel: "Pending sync",
      };
    case "syncing":
      return {
        color: tokens.colors.info,
        icon: "sync-outline",
        stateLabel: "Syncing",
      };
    case "failed":
      return {
        color: tokens.colors.error,
        icon: "alert-circle-outline",
        stateLabel: "Sync failed",
      };
    case "warning":
      return {
        color: tokens.colors.warning,
        icon: "warning-outline",
        stateLabel: "Warning",
      };
    case "info":
    default:
      return {
        color: tokens.colors.info,
        icon: "information-circle-outline",
        stateLabel: "Information",
      };
  }
};

const buildAccessibilityLabel = ({
  title,
  message,
  pendingCount,
  lastSyncLabel,
}: Pick<
  OperationalSyncBannerProps,
  "title" | "message" | "pendingCount" | "lastSyncLabel"
>): string =>
  [
    title,
    message,
    typeof pendingCount === "number" ? `${pendingCount} pending sync items` : null,
    lastSyncLabel ? `Last sync ${lastSyncLabel}` : null,
  ]
    .filter(Boolean)
    .join(". ");

const createStyles = (tokens: ThemeTokens, toneColor: string, compact: boolean) =>
  StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: colorWithAlpha(toneColor, tokens.mode === "dark" ? 0.48 : 0.32),
      backgroundColor: colorWithAlpha(toneColor, tokens.mode === "dark" ? 0.16 : 0.08),
      borderRadius: tokens.radius.md,
      paddingHorizontal: compact ? tokens.spacing.sm : tokens.spacing.md,
      paddingVertical: compact ? tokens.spacing.sm : tokens.spacing.md,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: tokens.spacing.sm,
    },
    iconWrap: {
      width: compact ? 32 : 36,
      height: compact ? 32 : 36,
      borderRadius: tokens.radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colorWithAlpha(toneColor, tokens.mode === "dark" ? 0.24 : 0.12),
    },
    copy: {
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
      fontSize: compact ? 13 : 14,
      fontWeight: "800",
      lineHeight: compact ? 18 : 20,
    },
    statePill: {
      borderRadius: tokens.radius.full,
      backgroundColor: colorWithAlpha(toneColor, tokens.mode === "dark" ? 0.28 : 0.14),
      paddingHorizontal: tokens.spacing.sm,
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
      alignItems: "center",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
      marginTop: tokens.spacing.xs,
    },
    metaChip: {
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: colorWithAlpha(toneColor, tokens.mode === "dark" ? 0.34 : 0.22),
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xxs,
    },
    metaText: {
      color: tokens.colors.textSecondary,
      fontSize: 11,
      fontWeight: "700",
    },
    actionButton: {
      ...getMinimumTouchTargetStyle(),
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: toneColor,
      alignSelf: "center",
      flexDirection: "row",
      gap: tokens.spacing.xs,
    },
    actionButtonPressed: {
      opacity: 0.82,
    },
    actionButtonDisabled: {
      opacity: 0.52,
    },
    actionText: {
      color: tokens.colors.surface,
      fontSize: 12,
      fontWeight: "800",
    },
  });

export function OperationalSyncBanner({
  title,
  message,
  tone = "info",
  pendingCount,
  lastSyncLabel,
  actionLabel,
  actionHint,
  onActionPress,
  actionDisabled = false,
  actionBusy = false,
  compact = false,
  style,
  testID,
}: OperationalSyncBannerProps) {
  const tokens = useUiTokens();
  const toneConfig = useMemo(() => getToneConfig(tone, tokens), [tokens, tone]);
  const styles = useMemo(
    () => createStyles(tokens, toneConfig.color, compact),
    [tokens, toneConfig.color, compact]
  );
  const decorativeIconProps = getDecorativeIconProps();
  const disabled = actionDisabled || actionBusy;
  const actionLabelText = actionLabel ?? "";
  const showAction = Boolean(actionLabelText && onActionPress);
  const accessibilityLabel = buildAccessibilityLabel({
    title,
    message,
    pendingCount,
    lastSyncLabel,
  });

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion={tone === "failed" || tone === "offline" ? "assertive" : "polite"}
      accessibilityRole={tone === "failed" ? "alert" : "text"}
      style={[styles.container, style]}
      testID={testID}
    >
      <View style={styles.iconWrap}>
        <Ionicons
          {...decorativeIconProps}
          name={toneConfig.icon}
          size={compact ? 18 : 20}
          color={toneConfig.color}
        />
      </View>

      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.statePill}>
            <Text style={styles.stateText}>{toneConfig.stateLabel}</Text>
          </View>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        {typeof pendingCount === "number" || lastSyncLabel ? (
          <View style={styles.metaRow}>
            {typeof pendingCount === "number" ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaText}>{pendingCount} pending</Text>
              </View>
            ) : null}
            {lastSyncLabel ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaText}>Last sync {lastSyncLabel}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {showAction ? (
        <Pressable
          {...getAccessibleButtonProps({
            label: actionLabelText,
            hint: actionHint,
            disabled,
            busy: actionBusy,
          })}
          disabled={disabled}
          onPress={onActionPress}
          style={({ pressed }) => [
            styles.actionButton,
            pressed && !disabled ? styles.actionButtonPressed : null,
            disabled ? styles.actionButtonDisabled : null,
          ]}
        >
          {actionBusy ? (
            <ActivityIndicator color={tokens.colors.surface} size="small" />
          ) : (
            <Ionicons
              {...decorativeIconProps}
              name="sync-outline"
              size={15}
              color={tokens.colors.surface}
            />
          )}
          <Text style={styles.actionText}>{actionLabelText}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default OperationalSyncBanner;
