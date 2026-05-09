/**
 * Shimmer Component - Operational Loading Feedback
 *
 * Tokenized shimmer loading effect with reduced-motion support.
 */

import React, { useEffect } from "react";
import {
  View,
  StyleSheet,
  ViewStyle,
  useWindowDimensions,
  DimensionValue,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getOperationalMotionDuration } from "@/utils/motion";

interface ShimmerProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
  variant?: "light" | "dark";
  duration?: number;
}

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

export const Shimmer: React.FC<ShimmerProps> = ({
  width = "100%",
  height = 20,
  borderRadius,
  style,
  variant = "dark",
  duration = 1500,
}) => {
  const uiTokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const translateX = useSharedValue(-screenWidth);
  const tokenDuration = getOperationalMotionDuration(uiTokens, "slow", prefersReducedMotion);
  const resolvedDuration = tokenDuration === 0 ? 0 : Math.min(duration, tokenDuration);
  const resolvedRadius = borderRadius ?? uiTokens.radius.md;
  const baseColor =
    variant === "dark"
      ? colorWithAlpha(uiTokens.colors.textMuted, 0.22)
      : colorWithAlpha(uiTokens.colors.textMuted, 0.14);
  const highlightColor =
    variant === "dark"
      ? colorWithAlpha(uiTokens.colors.surfaceElevated, 0.36)
      : colorWithAlpha(uiTokens.colors.surfaceElevated, 0.72);

  useEffect(() => {
    if (resolvedDuration === 0) {
      translateX.value = 0;
      return;
    }

    translateX.value = -screenWidth;
    translateX.value = withRepeat(
      withTiming(screenWidth, {
        duration: resolvedDuration,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [resolvedDuration, translateX, screenWidth]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const colors: readonly [string, string, string] = [
    baseColor,
    highlightColor,
    baseColor,
  ] as const;

  return (
    <View
      style={[
        styles.container,
        {
          width,
          height,
          borderRadius: resolvedRadius,
          backgroundColor: baseColor,
        },
        style,
      ]}
    >
      {resolvedDuration > 0 && (
        <AnimatedGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.gradient, { width: screenWidth * 2 }, animatedStyle]}
        />
      )}
    </View>
  );
};

/**
 * ShimmerPlaceholder - Pre-built shimmer placeholders
 */
export const ShimmerPlaceholder = {
  Text: ShimmerTextPlaceholder,
  Card: ShimmerCardPlaceholder,

  Avatar: ({
    size = 48,
    variant = "dark",
  }: {
    size?: number;
    variant?: "light" | "dark";
  }) => (
    <Shimmer
      height={size}
      width={size}
      borderRadius={size / 2}
      variant={variant}
    />
  ),

  StatsCard: ShimmerStatsCardPlaceholder,
  ListItem: ShimmerListItemPlaceholder,
};

function ShimmerTextPlaceholder({
  lines = 3,
  variant = "dark",
}: {
  lines?: number;
  variant?: "light" | "dark";
}) {
  const uiTokens = useUiTokens();
  return (
    <View style={[styles.textContainer, { gap: uiTokens.spacing.sm }]}>
      {Array.from({ length: lines }).map((_, index) => (
        <Shimmer
          key={index}
          height={16}
          width={index === lines - 1 ? "60%" : "100%"}
          variant={variant}
        />
      ))}
    </View>
  );
}

function ShimmerCardPlaceholder({ variant = "dark" }: { variant?: "light" | "dark" }) {
  const uiTokens = useUiTokens();
  return (
    <View
      style={[
        styles.cardContainer,
        {
          gap: uiTokens.spacing.md,
          padding: uiTokens.spacing.md,
          backgroundColor: colorWithAlpha(uiTokens.colors.surfaceElevated, 0.5),
          borderRadius: uiTokens.radius.xl,
        },
      ]}
    >
      <Shimmer height={56} width={56} borderRadius={uiTokens.radius.xl} variant={variant} />
      <View style={styles.cardContent}>
        <Shimmer height={24} width="40%" variant={variant} />
        <Shimmer
          height={14}
          width="70%"
          variant={variant}
          style={{ marginTop: uiTokens.spacing.sm }}
        />
      </View>
    </View>
  );
}

function ShimmerStatsCardPlaceholder({ variant = "dark" }: { variant?: "light" | "dark" }) {
  const uiTokens = useUiTokens();
  return (
    <View
      style={[
        styles.statsCardContainer,
        {
          padding: uiTokens.spacing.lg,
          backgroundColor: colorWithAlpha(uiTokens.colors.surfaceElevated, 0.5),
          borderRadius: uiTokens.radius.xl,
        },
      ]}
    >
      <Shimmer height={56} width={56} borderRadius={uiTokens.radius.xl} variant={variant} />
      <Shimmer
        height={36}
        width="50%"
        variant={variant}
        style={{ marginTop: uiTokens.spacing.md }}
      />
      <Shimmer
        height={14}
        width="70%"
        variant={variant}
        style={{ marginTop: uiTokens.spacing.sm }}
      />
    </View>
  );
}

function ShimmerListItemPlaceholder({ variant = "dark" }: { variant?: "light" | "dark" }) {
  const uiTokens = useUiTokens();
  return (
    <View
      style={[
        styles.listItemContainer,
        {
          gap: uiTokens.spacing.md,
          paddingVertical: uiTokens.spacing.sm,
        },
      ]}
    >
      <Shimmer height={40} width={40} borderRadius={uiTokens.radius.full} variant={variant} />
      <View style={styles.listItemContent}>
        <Shimmer height={16} width="60%" variant={variant} />
        <Shimmer
          height={12}
          width="40%"
          variant={variant}
          style={{ marginTop: uiTokens.spacing.xs + uiTokens.spacing.xxs }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  textContainer: {},
  cardContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardContent: {
    flex: 1,
  },
  statsCardContainer: {
    alignItems: "center",
  },
  listItemContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  listItemContent: {
    flex: 1,
  },
});

export default Shimmer;
