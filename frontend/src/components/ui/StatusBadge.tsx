/**
 * StatusBadge Component - Modern status indicator
 * Features:
 * - Semantic color variants (success, warning, error, info, neutral)
 * - Pill design with glow effects
 * - Optional icon
 * - Pulse animation for active states
 * - Size variants
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { borderRadius } from "@/theme/legacyCompat";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import { getDecorativeIconProps } from "@/utils/accessibility";
import { spacing } from "@/theme/unified/spacing";

type BadgeVariant =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral"
  | "primary";
type BadgeSize = "small" | "medium" | "large";

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: keyof typeof Ionicons.glyphMap;
  pulse?: boolean;
  style?: ViewStyle;
}

const buildVariantColors = (
  uiTokens: ThemeTokens,
): Record<BadgeVariant, { bg: string; text: string; glow: string; border: string }> => {
  const alpha =
    uiTokens.mode === "dark"
      ? { bg: 0.24, glow: 0.32, border: 0.45 }
      : { bg: 0.12, glow: 0.2, border: 0.3 };
  const build = (base: string) => ({
    bg: colorWithAlpha(base, alpha.bg),
    text: base,
    glow: colorWithAlpha(base, alpha.glow),
    border: colorWithAlpha(base, alpha.border),
  });

  return {
    success: build(uiTokens.colors.success),
    warning: build(uiTokens.colors.warning),
    error: build(uiTokens.colors.error),
    info: build(uiTokens.colors.info),
    neutral: build(uiTokens.colors.textSecondary),
    primary: build(uiTokens.colors.accent),
  };
};

const sizeStyles: Record<
  BadgeSize,
  { paddingH: number; paddingV: number; fontSize: number; iconSize: number }
> = {
  small: { paddingH: 8, paddingV: 3, fontSize: 10, iconSize: 10 },
  medium: { paddingH: 10, paddingV: 4, fontSize: 11, iconSize: 12 },
  large: { paddingH: 14, paddingV: 6, fontSize: 12, iconSize: 14 },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = "neutral",
  size = "medium",
  icon,
  pulse = false,
  style,
}) => {
  const uiTokens = useUiTokens();
  const colors = useMemo(() => buildVariantColors(uiTokens)[variant], [uiTokens, variant]);
  const sizeConfig = sizeStyles[size];

  // Pulse animation
  const pulseOpacity = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  React.useEffect(() => {
    if (pulse) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 800 }),
          withTiming(1, { duration: 800 }),
        ),
        -1,
        true,
      );
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: 800 }),
          withTiming(1, { duration: 800 }),
        ),
        -1,
        true,
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
    gap: spacing.xs,
    paddingHorizontal: sizeConfig.paddingH,
    paddingVertical: sizeConfig.paddingV,
    borderRadius: borderRadius.full,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  };

  const content = (
    <>
      {icon && (
        <Ionicons
          name={icon}
          size={sizeConfig.iconSize}
          color={colors.text}
          {...getDecorativeIconProps()}
        />
      )}
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
    return (
      <Animated.View
        style={[containerStyle, animatedStyle, style]}
        accessible={true}
        accessibilityRole="text"
        accessibilityLabel={label}
      >
        {content}
      </Animated.View>
    );
  }

  return (
    <View
      style={[containerStyle, style]}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {content}
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});

export default StatusBadge;
