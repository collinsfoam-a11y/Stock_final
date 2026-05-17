/**
 * StatusBadge Component - Modern status indicator
 * Features:
 * - Semantic color variants (success, warning, error, info, neutral)
 * - Pill design with glow effects
 * - Optional icon
 * - Pulse animation for active states
 * - Size variants
 */

import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { borderRadius, colors, semanticColors, spacing } from "@/theme/legacyCompat";
import { colorWithAlpha } from "@/theme/themeTokens";
import { operationalMotion } from "@/utils/motion";

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral" | "primary";
type BadgeSize = "small" | "medium" | "large";

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: keyof typeof Ionicons.glyphMap;
  pulse?: boolean;
  style?: ViewStyle;
}

const variantColors: Record<
  BadgeVariant,
  { bg: string; text: string; glow: string; border: string }
> = {
  success: {
    bg: colorWithAlpha(colors.success[500], 0.15),
    text: colors.success[50],
    glow: colorWithAlpha(colors.success[500], 0.25),
    border: colorWithAlpha(colors.success[500], 0.35),
  },
  warning: {
    bg: colorWithAlpha(colors.warning[500], 0.15),
    text: colors.warning[50],
    glow: colorWithAlpha(colors.warning[500], 0.25),
    border: colorWithAlpha(colors.warning[500], 0.35),
  },
  error: {
    bg: colorWithAlpha(colors.error[500], 0.15),
    text: colors.error[50],
    glow: colorWithAlpha(colors.error[500], 0.25),
    border: colorWithAlpha(colors.error[500], 0.35),
  },
  info: {
    bg: colorWithAlpha(colors.info[500], 0.15),
    text: colors.info[50],
    glow: colorWithAlpha(colors.info[500], 0.25),
    border: colorWithAlpha(colors.info[500], 0.35),
  },
  neutral: {
    bg: colorWithAlpha(colors.neutral[500], 0.15),
    text: semanticColors.text.secondary,
    glow: colorWithAlpha(colors.neutral[500], 0.25),
    border: colorWithAlpha(colors.neutral[500], 0.35),
  },
  primary: {
    bg: colorWithAlpha(colors.primary[500], 0.15),
    text: colors.primary[400],
    glow: colorWithAlpha(colors.primary[500], 0.25),
    border: colorWithAlpha(colors.primary[500], 0.35),
  },
};

const sizeStyles: Record<
  BadgeSize,
  { paddingH: number; paddingV: number; fontSize: number; iconSize: number }
> = {
  small: { paddingH: spacing.sm, paddingV: spacing.xs, fontSize: 10, iconSize: 10 },
  medium: { paddingH: spacing.md, paddingV: spacing.xs, fontSize: 11, iconSize: 12 },
  large: { paddingH: spacing.lg, paddingV: spacing.sm, fontSize: 12, iconSize: 14 },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = "neutral",
  size = "medium",
  icon,
  pulse = false,
  style,
}) => {
  const colors = variantColors[variant];
  const sizeConfig = sizeStyles[size];

  // Pulse animation
  const pulseOpacity = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  React.useEffect(() => {
    if (pulse) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: operationalMotion.slow }),
          withTiming(1, { duration: operationalMotion.slow })
        ),
        -1,
        true
      );
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: operationalMotion.slow }),
          withTiming(1, { duration: operationalMotion.slow })
        ),
        -1,
        true
      );
    }
  }, [pulse, pulseOpacity, pulseScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));

  const containerStyle: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: sizeConfig.paddingH / 2,
    paddingHorizontal: sizeConfig.paddingH,
    paddingVertical: sizeConfig.paddingV,
    borderRadius: borderRadius.full,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  };

  const content = (
    <>
      {icon && <Ionicons name={icon} size={sizeConfig.iconSize} color={colors.text} />}
      <Text
        style={[
          styles.label,
          {
            fontSize: sizeConfig.fontSize,
            color: colors.text,
          },
        ]}
      >
        {label}
      </Text>
    </>
  );

  if (pulse) {
    return <Animated.View style={[containerStyle, animatedStyle, style]}>{content}</Animated.View>;
  }

  return <View style={[containerStyle, style]}>{content}</View>;
};

const styles = StyleSheet.create({
  label: {
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});

export default StatusBadge;
