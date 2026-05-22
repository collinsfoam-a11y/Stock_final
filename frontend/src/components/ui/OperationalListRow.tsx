import React, { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type {
  AccessibilityRole,
  AccessibilityState,
  GestureResponderEvent,
  StyleProp,
  ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import {
  getOperationalSeverityColor,
  getOperationalSeverityDefinition,
  getOperationalToneColor,
  resolveOperationalTone,
  type OperationalSeverityLevel,
  type OperationalToneToken,
} from "@/theme/operationalSeverity";
import {
  getAccessibleButtonProps,
  getDecorativeIconProps,
  getMinimumTouchTargetStyle,
} from "@/utils/accessibility";

export type OperationalListRowTone = OperationalToneToken;
export type OperationalListRowSeverity = "none" | OperationalSeverityLevel;
export type OperationalListRowDensity = "compact" | "standard" | "comfortable";

export type OperationalListRowBadge = {
  label: string;
  tone?: OperationalListRowTone;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
};

export type OperationalListRowMetric = {
  label: string;
  value: string | number;
  tone?: OperationalListRowTone;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
};

export type OperationalListRowTimestamp =
  | string
  | {
      label?: string;
      value: string;
      icon?: keyof typeof Ionicons.glyphMap;
    };

export type OperationalListRowAccessibility = {
  label?: string;
  hint?: string;
  role?: AccessibilityRole;
  state?: AccessibilityState;
};

export interface OperationalListRowProps {
  title: string;
  subtitle?: string;
  metadata?: string | string[] | React.ReactNode;
  status?: string;
  statusTone?: OperationalListRowTone;
  severity?: OperationalListRowSeverity;
  leftIcon?: keyof typeof Ionicons.glyphMap | React.ReactNode;
  actions?: React.ReactNode;
  badges?: OperationalListRowBadge[];
  metrics?: OperationalListRowMetric[];
  timestamps?: OperationalListRowTimestamp | OperationalListRowTimestamp[];
  accessibility?: OperationalListRowAccessibility;
  compact?: boolean;
  density?: OperationalListRowDensity;
  selected?: boolean;
  selectable?: boolean;
  disabled?: boolean;
  loading?: boolean;
  skeleton?: boolean;
  error?: string | boolean;
  onPress?: (event: GestureResponderEvent) => void;
  onKeyboardOpen?: () => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  enteringDelay?: number;
  testID?: string;
}

export const OPERATIONAL_LIST_ROW_ESTIMATED_HEIGHT = {
  compact: 80,
  standard: 104,
  comfortable: 120,
} as const;

const normalizeStatusTone = (status?: string, fallback: OperationalListRowTone = "neutral") => {
  return resolveOperationalTone(status, fallback);
};

const getSeverityTone = (
  severity: OperationalListRowSeverity,
  statusTone: OperationalListRowTone
): OperationalListRowTone => {
  if (severity === "none") return statusTone;
  return getOperationalSeverityDefinition(severity).tone;
};

const normalizeArray = <T,>(value: T | T[] | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const getMetadataText = (metadata: OperationalListRowProps["metadata"]): string[] => {
  if (!metadata) return [];
  if (typeof metadata === "string") return [metadata];
  if (Array.isArray(metadata)) return metadata.filter(Boolean);
  return [];
};

const getTimestampText = (timestamp: OperationalListRowTimestamp): string => {
  if (typeof timestamp === "string") return timestamp;
  return timestamp.label ? `${timestamp.label} ${timestamp.value}` : timestamp.value;
};

const buildAccessibilityLabel = ({
  title,
  subtitle,
  metadata,
  status,
  badges,
  metrics,
  timestamps,
  error,
}: Pick<
  OperationalListRowProps,
  "title" | "subtitle" | "metadata" | "status" | "badges" | "metrics" | "timestamps" | "error"
>) =>
  [
    title,
    subtitle,
    status ? `Status ${status}` : null,
    ...getMetadataText(metadata),
    ...(badges || []).map((badge) => badge.accessibilityLabel || badge.label),
    ...(metrics || []).map((metric) => metric.accessibilityLabel || `${metric.label} ${metric.value}`),
    ...normalizeArray(timestamps).map(getTimestampText),
    typeof error === "string" ? `Error ${error}` : error ? "Error" : null,
  ]
    .filter(Boolean)
    .join(". ");

const createStyles = (
  tokens: ThemeTokens,
  density: OperationalListRowDensity,
  statusColor: string,
  severityColor: string,
  selected: boolean,
  focused: boolean,
  disabled: boolean
) => {
  const compact = density === "compact";
  const comfortable = density === "comfortable";
  const verticalPadding = compact
    ? tokens.spacing.xs
    : comfortable
      ? tokens.spacing.md
      : tokens.spacing.sm;
  const iconSize = compact ? 32 : comfortable ? 44 : 38;
  const isActive = selected || focused;

  return StyleSheet.create({
    rowShell: {
      opacity: disabled ? 0.56 : 1,
    },
    row: {
      ...getMinimumTouchTargetStyle(compact ? 48 : 56),
      borderWidth: 1,
      borderColor: isActive ? colorWithAlpha(statusColor, focused ? 0.86 : 0.72) : tokens.colors.border,
      backgroundColor: isActive
        ? colorWithAlpha(statusColor, tokens.mode === "dark" ? 0.2 : 0.11)
        : tokens.colors.surfaceElevated,
      borderRadius: tokens.radius.md,
      flexDirection: "row",
      alignItems: "stretch",
      overflow: "hidden",
    },
    pressed: {
      backgroundColor: colorWithAlpha(statusColor, tokens.mode === "dark" ? 0.18 : 0.08),
      borderColor: colorWithAlpha(statusColor, 0.46),
    },
    severityRail: {
      width: isActive ? 6 : 4,
      backgroundColor: severityColor,
    },
    body: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: compact ? tokens.spacing.xs : tokens.spacing.sm,
      paddingHorizontal: compact ? tokens.spacing.sm : tokens.spacing.md,
      paddingVertical: verticalPadding,
    },
    leftIcon: {
      width: iconSize,
      height: iconSize,
      borderRadius: tokens.radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colorWithAlpha(statusColor, tokens.mode === "dark" ? 0.18 : 0.1),
      borderWidth: 1,
      borderColor: colorWithAlpha(statusColor, tokens.mode === "dark" ? 0.28 : 0.18),
    },
    content: {
      flex: 1,
      minWidth: 0,
      gap: tokens.spacing.xs,
    },
    topLine: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: tokens.spacing.xs,
    },
    titleBlock: {
      flex: 1,
      minWidth: 0,
      gap: tokens.spacing.xxs,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: compact ? 14 : 16,
      lineHeight: compact ? 18 : 21,
      fontWeight: "800",
    },
    subtitle: {
      color: tokens.colors.textSecondary,
      fontSize: compact ? 12 : 13,
      lineHeight: compact ? 16 : 18,
      fontWeight: "600",
    },
    statusBadge: {
      borderRadius: tokens.radius.full,
      borderWidth: 1,
      borderColor: colorWithAlpha(statusColor, 0.34),
      backgroundColor: colorWithAlpha(statusColor, tokens.mode === "dark" ? 0.18 : 0.1),
      paddingHorizontal: compact ? tokens.spacing.xs : tokens.spacing.sm,
      paddingVertical: tokens.spacing.xxs,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
      maxWidth: "46%",
    },
    statusText: {
      color: statusColor,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    metricsRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    metricPill: {
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      paddingHorizontal: tokens.spacing.xs,
      paddingVertical: tokens.spacing.xxs,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xxs,
      maxWidth: "100%",
    },
    metricLabel: {
      color: tokens.colors.textMuted,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    metricValue: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: "900",
    },
    metadataRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    metadataChip: {
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.xs,
      paddingVertical: tokens.spacing.xxs,
    },
    metadataText: {
      color: tokens.colors.textSecondary,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "700",
    },
    badgesRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    badge: {
      borderRadius: tokens.radius.full,
      borderWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xxs,
      paddingHorizontal: tokens.spacing.xs,
      paddingVertical: tokens.spacing.xxs,
    },
    badgeText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    timestampRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    timestampItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
    },
    timestampText: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "700",
    },
    actions: {
      alignSelf: "center",
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
    },
    errorText: {
      color: tokens.colors.error,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "700",
    },
    skeletonBlock: {
      borderRadius: tokens.radius.sm,
      backgroundColor: colorWithAlpha(
        tokens.colors.textMuted,
        tokens.mode === "dark" ? 0.22 : 0.12
      ),
    },
    skeletonContent: {
      flex: 1,
      gap: tokens.spacing.sm,
    },
    skeletonLineLg: {
      height: compact ? 14 : 16,
      width: "62%",
    },
    skeletonLineSm: {
      height: 12,
      width: "42%",
    },
  });
};

function OperationalListRowComponent({
  title,
  subtitle,
  metadata,
  status,
  statusTone,
  severity = "none",
  leftIcon,
  actions,
  badges,
  metrics,
  timestamps,
  accessibility,
  compact = false,
  density,
  selected = false,
  selectable = false,
  disabled = false,
  loading = false,
  skeleton = false,
  error,
  onPress,
  onKeyboardOpen,
  onLongPress,
  style,
  contentStyle,
  enteringDelay = 0,
  testID,
}: OperationalListRowProps) {
  const tokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const decorativeIconProps = getDecorativeIconProps();
  const resolvedDensity = density || (compact ? "compact" : "standard");
  const resolvedStatusTone = statusTone || normalizeStatusTone(status);
  const statusColor = getOperationalToneColor(tokens, resolvedStatusTone);
  const severityTone = getSeverityTone(severity, resolvedStatusTone);
  const severityColor =
    severity === "none"
      ? getOperationalToneColor(tokens, severityTone)
      : getOperationalSeverityColor(tokens, severity);
  const styles = useMemo(
    () =>
      createStyles(tokens, resolvedDensity, statusColor, severityColor, selected, focused, disabled),
    [tokens, resolvedDensity, statusColor, severityColor, selected, focused, disabled]
  );
  const isInteractive = Boolean(onPress || onLongPress) && !loading && !skeleton && !error;
  const accessibilityLabel =
    accessibility?.label ||
    buildAccessibilityLabel({ title, subtitle, metadata, status, badges, metrics, timestamps, error });
  const accessibilityHint =
    accessibility?.hint || (isInteractive ? "Opens row details" : undefined);
  const accessibilityState = {
    selected: selectable || selected ? selected : undefined,
    disabled: disabled || loading || skeleton || Boolean(error) || undefined,
    busy: loading || skeleton || undefined,
    ...accessibility?.state,
  };
  const badgeList = badges || [];
  const metricList = metrics || [];
  const timestampList = normalizeArray(timestamps);

  const handleKeyDown = useCallback(
    (event: any) => {
      if (!isInteractive || !onPress) return;
      const key = event?.nativeEvent?.key || event?.key;
      if (key === "Enter" && onKeyboardOpen) {
        event?.preventDefault?.();
        onKeyboardOpen();
        return;
      }
      if (key === "Enter" || key === " ") {
        event?.preventDefault?.();
        onPress(event as GestureResponderEvent);
      }
    },
    [isInteractive, onKeyboardOpen, onPress]
  );

  const webKeyboardProps =
    Platform.OS === "web" && isInteractive
      ? ({
          tabIndex: disabled ? -1 : 0,
          onKeyDown: handleKeyDown,
        } as Record<string, unknown>)
      : null;

  const rowContent = (
    <Pressable
      {...(isInteractive
        ? getAccessibleButtonProps({
            label: accessibilityLabel,
            hint: accessibilityHint,
            disabled,
            selected: selectable || selected ? selected : undefined,
            busy: loading || skeleton,
          })
        : {
            accessible: true,
            accessibilityLabel,
            accessibilityRole: accessibility?.role || (error ? "alert" : "text"),
            accessibilityState,
          })}
      {...webKeyboardProps}
      disabled={!isInteractive || disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && isInteractive ? styles.pressed : null]}
      testID={testID}
    >
      <View style={styles.severityRail} />

      <View style={[styles.body, contentStyle]}>
        <View style={styles.leftIcon}>
          {loading || skeleton ? (
            <ActivityIndicator color={statusColor} size="small" />
          ) : typeof leftIcon === "string" ? (
            <Ionicons
              {...decorativeIconProps}
              name={leftIcon as keyof typeof Ionicons.glyphMap}
              size={compact ? 18 : 20}
              color={statusColor}
            />
          ) : (
            leftIcon || (
              <Ionicons
                {...decorativeIconProps}
                name={error ? "alert-circle-outline" : "list-outline"}
                size={compact ? 18 : 20}
                color={error ? tokens.colors.error : statusColor}
              />
            )
          )}
        </View>

        {loading || skeleton ? (
          <View
            style={styles.skeletonContent}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            <View style={[styles.skeletonBlock, styles.skeletonLineLg]} />
            <View style={[styles.skeletonBlock, styles.skeletonLineSm]} />
          </View>
        ) : (
          <View style={styles.content}>
            <View style={styles.topLine}>
              <View style={styles.titleBlock}>
                <Text style={styles.title} numberOfLines={compact ? 1 : 2}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text style={styles.subtitle} numberOfLines={compact ? 1 : 2}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>

              {status ? (
                <View style={styles.statusBadge}>
                  <Ionicons {...decorativeIconProps} name="ellipse" size={7} color={statusColor} />
                  <Text style={styles.statusText} numberOfLines={1}>
                    {status}
                  </Text>
                </View>
              ) : null}
            </View>

            {typeof metadata === "string" || Array.isArray(metadata) ? (
              <View style={styles.metadataRow}>
                {getMetadataText(metadata).map((item) => (
                  <View key={item} style={styles.metadataChip}>
                    <Text style={styles.metadataText} numberOfLines={1}>
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              metadata
            )}

            {metricList.length > 0 ? (
              <View style={styles.metricsRow}>
                {metricList.map((metric) => {
                  const metricTone = metric.tone || resolvedStatusTone;
                  const metricColor = getOperationalToneColor(tokens, metricTone);
                  return (
                    <View
                      key={`${metric.label}-${metric.value}`}
                      accessibilityLabel={metric.accessibilityLabel || `${metric.label} ${metric.value}`}
                      style={[
                        styles.metricPill,
                        {
                          borderColor: colorWithAlpha(metricColor, 0.3),
                          backgroundColor: colorWithAlpha(
                            metricColor,
                            tokens.mode === "dark" ? 0.13 : 0.07
                          ),
                        },
                      ]}
                    >
                      {metric.icon ? (
                        <Ionicons
                          {...decorativeIconProps}
                          name={metric.icon}
                          size={11}
                          color={metricColor}
                        />
                      ) : null}
                      <Text style={styles.metricLabel} numberOfLines={1}>
                        {metric.label}
                      </Text>
                      <Text style={[styles.metricValue, { color: metricColor }]} numberOfLines={1}>
                        {metric.value}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {badgeList.length > 0 ? (
              <View style={styles.badgesRow}>
                {badgeList.map((badge) => {
                  const badgeTone = badge.tone || "neutral";
                  const badgeColor = getOperationalToneColor(tokens, badgeTone);
                  return (
                    <View
                      key={`${badge.label}-${badgeTone}`}
                      accessibilityLabel={badge.accessibilityLabel || badge.label}
                      style={[
                        styles.badge,
                        {
                          borderColor: colorWithAlpha(badgeColor, 0.34),
                          backgroundColor: colorWithAlpha(
                            badgeColor,
                            tokens.mode === "dark" ? 0.16 : 0.08
                          ),
                        },
                      ]}
                    >
                      {badge.icon ? (
                        <Ionicons
                          {...decorativeIconProps}
                          name={badge.icon}
                          size={12}
                          color={badgeColor}
                        />
                      ) : null}
                      <Text style={[styles.badgeText, { color: badgeColor }]} numberOfLines={1}>
                        {badge.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {timestampList.length > 0 ? (
              <View style={styles.timestampRow}>
                {timestampList.map((timestamp) => {
                  const label = getTimestampText(timestamp);
                  const icon =
                    typeof timestamp === "string"
                      ? "time-outline"
                      : timestamp.icon || "time-outline";
                  return (
                    <View key={label} style={styles.timestampItem}>
                      <Ionicons
                        {...decorativeIconProps}
                        name={icon}
                        size={12}
                        color={tokens.colors.textMuted}
                      />
                      <Text style={styles.timestampText} numberOfLines={1}>
                        {label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {error ? (
              <Text style={styles.errorText} numberOfLines={2}>
                {typeof error === "string" ? error : "Unable to load row data"}
              </Text>
            ) : null}
          </View>
        )}

        {actions ? (
          <View style={styles.actions}>{actions}</View>
        ) : isInteractive ? (
          <View style={styles.actions}>
            <Ionicons
              {...decorativeIconProps}
              name="chevron-forward"
              size={18}
              color={tokens.colors.textMuted}
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  );

  const entering =
    prefersReducedMotion || enteringDelay < 0
      ? undefined
      : FadeInDown.delay(Math.min(enteringDelay, 180)).duration(tokens.motion.fast);

  return (
    <Animated.View entering={entering} style={[styles.rowShell, style]}>
      {rowContent}
    </Animated.View>
  );
}

export const OperationalListRow = memo(OperationalListRowComponent);

export default OperationalListRow;
