/**
 * StatsCard Component - Operational UI
 *
 * Token-based KPI card for dense operational dashboards.
 * Features:
 * - Semantic status accent
 * - Token-aligned card surface
 * - Stable dimensions for dense grids
 * - Animated counter values
 * - Haptic feedback
 */

import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { AnimatedPressable } from "./AnimatedPressable";
import { AnimatedCounter } from "./AnimatedCounter";
import { ModernCard } from "./ModernCard";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import { font, gap, radius } from '@/theme/staffUiScale';

export type StatVariant = "primary" | "success" | "warning" | "error" | "info";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  variant?: StatVariant;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  onPress?: () => void;
  style?: ViewStyle;
  delay?: number;
  animated?: boolean; // Enable animated counter
  prefix?: string; // Prefix for value (e.g., "$")
  suffix?: string; // Suffix for value (e.g., "%")
}

const getVariantColor = (tokens: ThemeTokens, variant: StatVariant): string => {
  switch (variant) {
    case "success":
      return tokens.colors.success;
    case "warning":
      return tokens.colors.warning;
    case "error":
      return tokens.colors.error;
    case "info":
      return tokens.colors.info;
    case "primary":
    default:
      return tokens.colors.accent;
  }
};

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon,
  variant = "primary",
  subtitle,
  trend,
  onPress,
  style,
  delay = 0,
  animated = false,
  prefix = "",
  suffix = "",
}) => {
  const uiTokens = useUiTokens();
  const variantColor = getVariantColor(uiTokens, variant);
  const numericValue = typeof value === "number" ? value : parseFloat(value) || 0;
  const iconSize = uiTokens.spacing.xl + uiTokens.spacing.lg;
  const iconBackgroundAlpha = uiTokens.mode === "dark" ? 0.24 : 0.12;

  const content = (
    <View style={[styles.content, { gap: uiTokens.spacing.sm }]}>
      <View
        style={[
          styles.iconContainer,
          {
            width: iconSize,
            height: iconSize,
            borderRadius: uiTokens.radius.lg,
            backgroundColor: colorWithAlpha(variantColor, iconBackgroundAlpha),
            borderColor: colorWithAlpha(variantColor, 0.28),
          },
        ]}
      >
        <Ionicons name={icon} size={28} color={variantColor} />
      </View>

      {/* Stats */}
      <View style={[styles.stats, { gap: uiTokens.spacing.xs }]}>
        {animated && typeof value === "number" ? (
          <AnimatedCounter
            value={numericValue}
            prefix={prefix}
            suffix={suffix}
            style={[
              styles.value,
              {
                color: uiTokens.colors.textPrimary,
              },
            ]}
          />
        ) : (
          <Text
            style={[
              styles.value,
              {
                color: uiTokens.colors.textPrimary,
              },
            ]}
          >
            {prefix}
            {value}
            {suffix}
          </Text>
        )}

        <Text
          style={[
            styles.title,
            {
              color: uiTokens.colors.textSecondary,
            },
          ]}
        >
          {title}
        </Text>

        {!!subtitle && (
          <Text
            style={[
              styles.subtitle,
              {
                color: uiTokens.colors.textMuted,
              },
            ]}
          >
            {subtitle}
          </Text>
        )}

        {trend && (
          <View style={styles.trendContainer}>
            <Ionicons
              name={trend.isPositive ? "trending-up" : "trending-down"}
              size={14}
              color={trend.isPositive ? uiTokens.colors.success : uiTokens.colors.error}
            />
            <Text
              style={[
                styles.trendText,
                {
                  color: trend.isPositive ? uiTokens.colors.success : uiTokens.colors.error,
                },
              ]}
            >
              {Math.abs(trend.value)}%
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const cardContent = (
    <Animated.View entering={FadeInDown.delay(delay).springify()}>
      <ModernCard variant="outlined" elevation="none" padding={uiTokens.spacing.md} style={style}>
        {content}
      </ModernCard>
    </Animated.View>
  );

  if (onPress) {
    return (
      <AnimatedPressable onPress={onPress} hapticFeedback="light">
        {cardContent}
      </AnimatedPressable>
    );
  }

  return cardContent;
};

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
  },
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  stats: {
    alignItems: "center",
  },
  value: {
    fontSize: 26,
    fontWeight: "700",
  },
  title: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "500",
  },
  subtitle: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 4,
  },
  trendContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: gap.xs,
    marginTop: 4,
  },
  trendText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
