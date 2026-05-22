import React, { memo, useCallback, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useKeyboardShortcuts, type KeyboardShortcut } from "@/hooks/useKeyboardShortcuts";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import {
  getOperationalToneColor,
  type OperationalCommandSemanticTone,
} from "@/theme/operationalSeverity";
import {
  OPERATIONAL_TELEMETRY_EVENT_REGISTRY,
  operationalTelemetry,
} from "@/services/observability/operationalTelemetry";
import {
  getAccessibleButtonProps,
  getDecorativeIconProps,
  getMinimumTouchTargetStyle,
} from "@/utils/accessibility";

export type OperationalCommandTone = OperationalCommandSemanticTone;

export type OperationalCommandAction = {
  id?: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: OperationalCommandTone;
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  shortcut?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export interface OperationalCommandBarProps {
  actions: OperationalCommandAction[];
  title?: string;
  subtitle?: string;
  summary?: React.ReactNode;
  compact?: boolean;
  align?: "start" | "end" | "stretch";
  enableKeyboardShortcuts?: boolean;
  telemetrySurface?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const createStyles = (tokens: ThemeTokens, compact: boolean, align: NonNullable<OperationalCommandBarProps["align"]>) =>
  StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      borderRadius: tokens.radius.md,
      padding: compact ? tokens.spacing.xs : tokens.spacing.sm,
      gap: tokens.spacing.xs,
    },
    contentRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
      flexWrap: "wrap",
    },
    copy: {
      flex: 1,
      minWidth: 180,
      gap: tokens.spacing.xxs,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: compact ? 13 : 14,
      lineHeight: compact ? 18 : 20,
      fontWeight: "800",
    },
    subtitle: {
      color: tokens.colors.textSecondary,
      fontSize: compact ? 12 : 13,
      lineHeight: compact ? 16 : 18,
      fontWeight: "600",
    },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        align === "start" ? "flex-start" : align === "stretch" ? "space-between" : "flex-end",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
      flexGrow: align === "stretch" ? 1 : 0,
    },
    actionButton: {
      ...getMinimumTouchTargetStyle(compact ? 44 : 48),
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      paddingHorizontal: compact ? tokens.spacing.sm : tokens.spacing.md,
      paddingVertical: compact ? tokens.spacing.xs : tokens.spacing.sm,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: tokens.spacing.xs,
      flexGrow: align === "stretch" ? 1 : 0,
    },
    actionPressed: {
      opacity: 0.82,
    },
    actionDisabled: {
      opacity: 0.52,
    },
    actionText: {
      fontSize: compact ? 12 : 13,
      lineHeight: compact ? 16 : 18,
      fontWeight: "800",
    },
    shortcutChip: {
      minWidth: 22,
      borderRadius: tokens.radius.sm,
      paddingHorizontal: tokens.spacing.xs,
      paddingVertical: tokens.spacing.xxs,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colorWithAlpha(tokens.colors.surfaceElevated, tokens.mode === "dark" ? 0.72 : 0.88),
    },
    shortcutText: {
      color: tokens.colors.textMuted,
      fontSize: 10,
      lineHeight: 12,
      fontWeight: "800",
      textTransform: "uppercase",
    },
  });

const parseShortcut = (shortcut?: string): KeyboardShortcut | null => {
  if (!shortcut) return null;
  const parts = shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.pop();
  if (!key) return null;

  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  const hasMod = modifiers.has("mod") || modifiers.has("cmd") || modifiers.has("command");

  return {
    key,
    shift: modifiers.has("shift"),
    ctrl: hasMod ? undefined : modifiers.has("ctrl") || modifiers.has("control"),
    alt: modifiers.has("alt") || modifiers.has("option"),
    meta: hasMod ? undefined : modifiers.has("meta"),
    mod: hasMod ? true : undefined,
    preventDefault: true,
    ignoreEditableTargets: true,
    ignoreRepeat: true,
    callback: () => undefined,
  };
};

function OperationalCommandBarComponent({
  actions,
  title,
  subtitle,
  summary,
  compact = false,
  align = "end",
  enableKeyboardShortcuts = true,
  telemetrySurface,
  style,
  testID,
}: OperationalCommandBarProps) {
  const tokens = useUiTokens();
  const styles = useMemo(() => createStyles(tokens, compact, align), [tokens, compact, align]);
  const decorativeIconProps = getDecorativeIconProps();
  const shortcutActions = useMemo(
    () =>
      actions.filter(
        (action) => action.shortcut && action.onPress && !action.disabled && !action.busy
      ),
    [actions]
  );
  const hasCopy = Boolean(title || subtitle || summary);
  const resolvedTelemetrySurface = telemetrySurface || testID || title || "operational_command_bar";
  const executeAction = useCallback(
    (action: OperationalCommandAction, source: "press" | "keyboard") => {
      if (!action.onPress || action.disabled || action.busy) return;

      const command = action.id || action.label;
      const mark = operationalTelemetry.markStart({
        name:
          source === "keyboard"
            ? OPERATIONAL_TELEMETRY_EVENT_REGISTRY.KEYBOARD_SHORTCUT_USED
            : OPERATIONAL_TELEMETRY_EVENT_REGISTRY.COMMAND_EXECUTED,
        category: "workflow",
        surface: resolvedTelemetrySurface,
        tags: {
          command,
          tone: action.tone || "primary",
          source,
          shortcut: action.shortcut,
        },
      });

      try {
        const result = action.onPress() as unknown;
        if (result && typeof (result as Promise<unknown>).then === "function") {
          void (result as Promise<unknown>)
            .then(() => operationalTelemetry.markEnd(mark, "success"))
            .catch((error) => {
              operationalTelemetry.markEnd(mark, "failure", {
                error: error instanceof Error ? error.message : String(error),
              });
            });
          return;
        }

        operationalTelemetry.markEnd(mark, "success");
      } catch (error) {
        operationalTelemetry.markEnd(mark, "failure", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [resolvedTelemetrySurface]
  );
  const keyboardShortcuts = useMemo<KeyboardShortcut[]>(
    () =>
      enableKeyboardShortcuts
        ? shortcutActions
            .map((action) => {
              const shortcut = parseShortcut(action.shortcut);
              if (!shortcut) return null;
              return {
                ...shortcut,
                callback: () => executeAction(action, "keyboard"),
              };
            })
            .filter(Boolean) as KeyboardShortcut[]
        : [],
    [enableKeyboardShortcuts, executeAction, shortcutActions]
  );

  useKeyboardShortcuts(keyboardShortcuts);

  return (
    <View style={[styles.container, style]} testID={testID}>
      <View style={styles.contentRow}>
        {hasCopy ? (
          <View style={styles.copy}>
            {title ? (
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
            {summary}
          </View>
        ) : null}

        <View style={styles.actions}>
          {actions.map((action) => {
            const tone = action.tone || "primary";
            const toneColor = getOperationalToneColor(tokens, tone);
            const isFilled = tone !== "neutral";
            const disabled = Boolean(action.disabled || action.busy || !action.onPress);
            const label = action.accessibilityLabel || action.label;
            const shortcutSuffix = action.shortcut ? `. Shortcut ${action.shortcut}` : "";

            return (
              <Pressable
                key={action.id || action.label}
                {...getAccessibleButtonProps({
                  label: `${label}${shortcutSuffix}`,
                  hint: action.accessibilityHint,
                  disabled,
                  busy: action.busy,
                })}
                disabled={disabled}
                onPress={() => executeAction(action, "press")}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: isFilled
                      ? toneColor
                      : colorWithAlpha(toneColor, tokens.mode === "dark" ? 0.16 : 0.08),
                    borderColor: isFilled ? toneColor : colorWithAlpha(toneColor, 0.34),
                  },
                  pressed ? styles.actionPressed : null,
                  disabled ? styles.actionDisabled : null,
                ]}
              >
                {action.busy ? (
                  <ActivityIndicator
                    size="small"
                    color={isFilled ? tokens.colors.surface : toneColor}
                  />
                ) : action.icon ? (
                  <Ionicons
                    {...decorativeIconProps}
                    name={action.icon}
                    size={compact ? 16 : 18}
                    color={isFilled ? tokens.colors.surface : toneColor}
                  />
                ) : null}
                <Text
                  style={[
                    styles.actionText,
                    { color: isFilled ? tokens.colors.surface : toneColor },
                  ]}
                  numberOfLines={1}
                >
                  {action.label}
                </Text>
                {action.shortcut ? (
                  <View style={styles.shortcutChip}>
                    <Text style={styles.shortcutText}>{action.shortcut}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export const OperationalCommandBar = memo(OperationalCommandBarComponent);

export default OperationalCommandBar;
