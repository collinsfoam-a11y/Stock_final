import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { BREAKPOINTS } from "@/hooks/useResponsive";
import { useUiTokens } from "@/hooks/useUiTokens";
import {
  OPERATIONAL_TELEMETRY_EVENT_REGISTRY,
  operationalTelemetry,
} from "@/services/observability/operationalTelemetry";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import {
  getAccessibleButtonProps,
  getDecorativeIconProps,
  getMinimumTouchTargetStyle,
} from "@/utils/accessibility";

export interface OperationalSplitViewProps {
  sidebar: React.ReactNode;
  detail: React.ReactNode;
  collapsible?: boolean;
  persistSelection?: boolean;
  tabletBreakpoint?: number;
  desktopBreakpoint?: number;
  defaultCollapsed?: boolean;
  collapsedSidebar?: React.ReactNode;
  sidebarLabel?: string;
  detailLabel?: string;
  style?: StyleProp<ViewStyle>;
  sidebarStyle?: StyleProp<ViewStyle>;
  detailStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

const createStyles = (
  tokens: ThemeTokens,
  isSplit: boolean,
  isDesktop: boolean,
  sidebarWidth: number,
  collapsed: boolean
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      minHeight: 0,
      flexDirection: isSplit ? "row" : "column",
      gap: tokens.spacing.sm,
      alignItems: "stretch",
    },
    sidebarPane: {
      flexShrink: 0,
      flexGrow: isSplit ? 0 : 1,
      flexBasis: isSplit ? sidebarWidth : undefined,
      width: isSplit ? sidebarWidth : undefined,
      minWidth: isSplit ? (isDesktop ? sidebarWidth * 0.86 : sidebarWidth * 0.9) : undefined,
      maxWidth: isSplit ? sidebarWidth : undefined,
      minHeight: 0,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      overflow: "hidden",
    },
    sidebarCollapsed: {
      width: 56,
      flexBasis: 56,
      minWidth: 56,
      maxWidth: 56,
      alignItems: "center",
    },
    paneToolbar: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
      paddingHorizontal: collapsed ? tokens.spacing.xs : tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: tokens.colors.border,
      backgroundColor: colorWithAlpha(
        tokens.colors.surfaceElevated,
        tokens.mode === "dark" ? 0.62 : 0.72
      ),
    },
    paneToolbarCopy: {
      flex: 1,
      minWidth: 0,
    },
    paneToolbarTitle: {
      color: tokens.colors.textSecondary,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    collapseButton: {
      ...getMinimumTouchTargetStyle(44),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
    },
    collapseButtonPressed: {
      backgroundColor: colorWithAlpha(tokens.colors.accent, tokens.mode === "dark" ? 0.18 : 0.08),
      borderColor: colorWithAlpha(tokens.colors.accent, 0.42),
    },
    paneContent: {
      flex: 1,
      minHeight: 0,
    },
    collapsedContent: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.xs,
      paddingVertical: tokens.spacing.sm,
    },
    collapsedText: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: "800",
      textTransform: "uppercase",
      transform: [{ rotate: "-90deg" }],
      minWidth: 92,
      textAlign: "center",
    },
    detailPane: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: colorWithAlpha(tokens.colors.accent, tokens.mode === "dark" ? 0.34 : 0.22),
      backgroundColor: tokens.colors.surfaceElevated,
      overflow: "hidden",
    },
    detailStacked: {
      minHeight: 240,
    },
  });

function OperationalSplitViewComponent({
  sidebar,
  detail,
  collapsible = false,
  persistSelection = false,
  tabletBreakpoint = BREAKPOINTS.tablet,
  desktopBreakpoint = BREAKPOINTS.desktop,
  defaultCollapsed = false,
  collapsedSidebar,
  sidebarLabel = "Operational list",
  detailLabel = "Operational detail",
  style,
  sidebarStyle,
  detailStyle,
  testID,
}: OperationalSplitViewProps) {
  const tokens = useUiTokens();
  const { width } = useWindowDimensions();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const isSplit = width >= tabletBreakpoint;
  const isDesktop = width >= desktopBreakpoint;
  const sidebarWidth = isDesktop
    ? Math.min(Math.max(width * 0.32, 360), 460)
    : Math.min(Math.max(width * 0.38, 320), 380);
  const shouldRenderDetail = isSplit || persistSelection;
  const effectiveCollapsed = isSplit && collapsible && collapsed;
  const styles = useMemo(
    () => createStyles(tokens, isSplit, isDesktop, sidebarWidth, effectiveCollapsed),
    [tokens, isSplit, isDesktop, sidebarWidth, effectiveCollapsed]
  );
  const decorativeIconProps = getDecorativeIconProps();

  const toggleCollapsed = useCallback(() => {
    if (!collapsible || !isSplit) return;
    setCollapsed((value) => {
      const nextValue = !value;
      operationalTelemetry.track({
        name: OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SPLIT_VIEW_LAYOUT,
        category: "runtime",
        surface: testID || "operational_split_view",
        outcome: "success",
        tags: {
          action: nextValue ? "collapse" : "expand",
          sidebarLabel,
          detailLabel,
          isDesktop,
        },
      });
      return nextValue;
    });
  }, [collapsible, detailLabel, isDesktop, isSplit, sidebarLabel, testID]);

  const handleKeyDown = useCallback(
    (event: any) => {
      if (!collapsible || !isSplit) return;
      const key = event?.nativeEvent?.key || event?.key;
      if (key === "Enter" || key === " ") {
        event?.preventDefault?.();
        toggleCollapsed();
      }
    },
    [collapsible, isSplit, toggleCollapsed]
  );

  const webKeyboardProps =
    Platform.OS === "web" && collapsible && isSplit
      ? ({
          tabIndex: 0,
          onKeyDown: handleKeyDown,
        } as Record<string, unknown>)
      : null;

  useEffect(() => {
    operationalTelemetry.trackRuntime(
      OPERATIONAL_TELEMETRY_EVENT_REGISTRY.SPLIT_VIEW_LAYOUT,
      {
        surface: testID || "operational_split_view",
        layout: isSplit ? "split" : "stacked",
        collapsed: effectiveCollapsed,
        isDesktop,
      },
      {
        widthBucket: isDesktop ? 3 : isSplit ? 2 : 1,
        sidebarWidth,
      },
      { dedupeMs: 1000, sampleRate: 1 }
    );
  }, [effectiveCollapsed, isDesktop, isSplit, sidebarWidth, testID]);

  return (
    <View style={[styles.container, style]} testID={testID}>
      <View
        style={[
          styles.sidebarPane,
          effectiveCollapsed ? styles.sidebarCollapsed : null,
          sidebarStyle,
        ]}
        accessibilityRole="summary"
        accessibilityLabel={sidebarLabel}
      >
        {collapsible && isSplit ? (
          <View style={styles.paneToolbar}>
            {effectiveCollapsed ? null : (
              <View style={styles.paneToolbarCopy}>
                <Text style={styles.paneToolbarTitle} numberOfLines={1}>
                  {sidebarLabel}
                </Text>
              </View>
            )}
            <Pressable
              {...getAccessibleButtonProps({
                label: effectiveCollapsed ? `Expand ${sidebarLabel}` : `Collapse ${sidebarLabel}`,
                hint: "Changes the tablet split-view list width",
                expanded: !effectiveCollapsed,
              })}
              {...webKeyboardProps}
              onPress={toggleCollapsed}
              style={({ pressed }) => [
                styles.collapseButton,
                pressed ? styles.collapseButtonPressed : null,
              ]}
            >
              <Ionicons
                {...decorativeIconProps}
                name={effectiveCollapsed ? "chevron-forward" : "chevron-back"}
                size={18}
                color={tokens.colors.textSecondary}
              />
            </Pressable>
          </View>
        ) : null}

        {effectiveCollapsed ? (
          <View style={styles.collapsedContent}>
            {collapsedSidebar || (
              <Text style={styles.collapsedText} numberOfLines={1}>
                {sidebarLabel}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.paneContent}>{sidebar}</View>
        )}
      </View>

      {shouldRenderDetail ? (
        <View
          style={[styles.detailPane, !isSplit ? styles.detailStacked : null, detailStyle]}
          accessibilityRole="summary"
          accessibilityLabel={detailLabel}
        >
          {detail}
        </View>
      ) : null}
    </View>
  );
}

export const OperationalSplitView = memo(OperationalSplitViewComponent);

export default OperationalSplitView;
