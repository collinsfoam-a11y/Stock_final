import React, { memo, useCallback, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { GestureResponderEvent, StyleProp, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import { getOperationalSeverityColor } from "@/theme/operationalSeverity";
import {
  getAccessibleButtonProps,
  getDecorativeIconProps,
  getMinimumTouchTargetStyle,
} from "@/utils/accessibility";
import type { OperationalListRowSeverity } from "./OperationalListRow";

export interface OperationalListSectionProps {
  title: string;
  subtitle?: string;
  severity?: OperationalListRowSeverity;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  accessibility?: {
    label?: string;
    hint?: string;
  };
  testID?: string;
}

const createStyles = (tokens: ThemeTokens, severityColor: string, compact: boolean) =>
  StyleSheet.create({
    section: {
      gap: tokens.spacing.xs,
    },
    header: {
      ...getMinimumTouchTargetStyle(compact ? 44 : 48),
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      borderRadius: tokens.radius.md,
      flexDirection: "row",
      alignItems: "stretch",
      overflow: "hidden",
    },
    headerPressed: {
      backgroundColor: colorWithAlpha(severityColor, tokens.mode === "dark" ? 0.14 : 0.06),
    },
    severityRail: {
      width: 4,
      backgroundColor: severityColor,
    },
    headerBody: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
      paddingHorizontal: compact ? tokens.spacing.sm : tokens.spacing.md,
      paddingVertical: compact ? tokens.spacing.xs : tokens.spacing.sm,
    },
    collapseButton: {
      ...getMinimumTouchTargetStyle(compact ? 44 : 48),
      flex: 1,
      minWidth: 0,
      justifyContent: "center",
      borderRadius: tokens.radius.sm,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: tokens.spacing.xxs,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: compact ? 14 : 15,
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
      gap: tokens.spacing.xs,
      flexShrink: 0,
    },
    content: {
      gap: tokens.spacing.xs,
    },
  });

function OperationalListSectionComponent({
  title,
  subtitle,
  severity = "none",
  collapsible = false,
  defaultCollapsed = false,
  actions,
  children,
  compact = false,
  style,
  contentStyle,
  accessibility,
  testID,
}: OperationalListSectionProps) {
  const tokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const severityColor = getOperationalSeverityColor(tokens, severity);
  const styles = useMemo(
    () => createStyles(tokens, severityColor, compact),
    [tokens, severityColor, compact]
  );
  const decorativeIconProps = getDecorativeIconProps();
  const isInteractive = collapsible;
  const label =
    accessibility?.label ||
    `${collapsed ? "Expand" : "Collapse"} ${title}${subtitle ? `. ${subtitle}` : ""}`;

  const toggleCollapsed = useCallback(
    (_event?: GestureResponderEvent) => {
      if (!collapsible) return;
      setCollapsed((value) => !value);
    },
    [collapsible]
  );

  const handleKeyDown = useCallback(
    (event: any) => {
      if (!collapsible) return;
      const key = event?.nativeEvent?.key || event?.key;
      if (key === "Enter" || key === " ") {
        event?.preventDefault?.();
        toggleCollapsed(event as GestureResponderEvent);
      }
    },
    [collapsible, toggleCollapsed]
  );

  const webKeyboardProps =
    Platform.OS === "web" && collapsible
      ? ({
          tabIndex: 0,
          onKeyDown: handleKeyDown,
        } as Record<string, unknown>)
      : null;

  const copyContent = (
    <View style={styles.copy}>
      <View style={styles.titleRow}>
        {collapsible ? (
          <Ionicons
            {...decorativeIconProps}
            name={collapsed ? "chevron-forward" : "chevron-down"}
            size={16}
            color={tokens.colors.textMuted}
          />
        ) : null}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={compact ? 1 : 2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  const header = (
    <View
      style={styles.header}
      {...(!isInteractive
        ? {
            accessible: true,
            accessibilityRole: "header" as const,
            accessibilityLabel:
              accessibility?.label || `${title}${subtitle ? `. ${subtitle}` : ""}`,
          }
        : null)}
    >
      <View style={styles.severityRail} />
      <View style={styles.headerBody}>
        {collapsible ? (
          <Pressable
            {...getAccessibleButtonProps({
              label,
              hint: accessibility?.hint || "Shows or hides this operational list section",
              expanded: !collapsed,
            })}
            {...webKeyboardProps}
            onPress={toggleCollapsed}
            style={({ pressed }) => [styles.collapseButton, pressed ? styles.headerPressed : null]}
          >
            {copyContent}
          </Pressable>
        ) : (
          copyContent
        )}
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
    </View>
  );

  const entering = prefersReducedMotion ? undefined : FadeInDown.duration(tokens.motion.fast);

  return (
    <Animated.View entering={entering} style={[styles.section, style]} testID={testID}>
      {header}
      {collapsed ? null : <View style={[styles.content, contentStyle]}>{children}</View>}
    </Animated.View>
  );
}

export const OperationalListSection = memo(OperationalListSectionComponent);

export default OperationalListSection;
