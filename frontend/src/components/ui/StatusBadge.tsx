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
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";

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
  const variantConfig = React.useMemo(() => {
    const base = {
      success: uiTokens.colors.success,
      warning: uiTokens.colors.warning,
      error: uiTokens.colors.error,
      info: uiTokens.colors.info,
      neutral: uiTokens.colors.textSecondary,
      primary: uiTokens.colors.accent,
    }[variant];

    return {
      bg: colorWithAlpha(base, uiTokens.mode === "dark" ? 0.22 : 0.14),
      text: base,
      glow: colorWithAlpha(base, uiTokens.mode === "dark" ? 0.34 : 0.25),
      border: colorWithAlpha(base, uiTokens.mode === "dark" ? 0.44 : 0.35),
    };
  }, [uiTokens, variant]);
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
    gap: sizeConfig.paddingH / 2,
    paddingHorizontal: sizeConfig.paddingH,
    paddingVertical: sizeConfig.paddingV,
    borderRadius: uiTokens.radius.full,
    backgroundColor: variantConfig.bg,
    borderWidth: 1,
    borderColor: variantConfig.border,
  };

  const content = (
    <>
      {icon && (
        <Ionicons name={icon} size={sizeConfig.iconSize} color={variantConfig.text} />
      )}
      <Text
        style={[
          styles.label,
          {
            fontSize: sizeConfig.fontSize,
            color: variantConfig.text,
          },
        ]}
      >
        {label}
      </Text>
    </>
  );

  if (pulse) {
    return (
      <Animated.View style={[containerStyle, animatedStyle, style]}>
        {content}
      </Animated.View>
    );
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
