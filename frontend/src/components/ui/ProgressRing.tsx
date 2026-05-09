/**
 * ProgressRing Component - Aurora Design
 *
 * Circular progress indicator with gradient
 * Features:
 * - Smooth animation
 * - Gradient stroke
 * - Center label
 * - Customizable size and colors
 */

import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { auroraTheme } from "@/theme/auroraTheme";
import { useUiTokens } from "@/hooks/useUiTokens";

interface ProgressRingProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  colors?: readonly [string, string];
  label?: string;
  showPercentage?: boolean;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  size = 120,
  strokeWidth = 12,
  colors,
  label,
  showPercentage = true,
}) => {
  const uiTokens = useUiTokens();
  const animatedProgress = useSharedValue(0);
  const resolvedColors = colors ?? [uiTokens.colors.accent, uiTokens.colors.accentStrong];
  const animationDuration = uiTokens.motion.enabled ? uiTokens.motion.slow : 0;

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const center = size / 2;

  useEffect(() => {
    animatedProgress.value = withTiming(progress, {
      duration: animationDuration,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [animatedProgress, animationDuration, progress]);

  const animatedProps = useAnimatedProps(() => {
    const strokeDashoffset = circumference - (circumference * animatedProgress.value) / 100;
    return {
      strokeDashoffset,
    };
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={resolvedColors[0]} stopOpacity="1" />
            <Stop offset="100%" stopColor={resolvedColors[1]} stopOpacity="1" />
          </SvgLinearGradient>
        </Defs>

        {/* Background Circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={uiTokens.colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Progress Circle */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke="url(#progressGradient)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          strokeLinecap="round"
          animatedProps={animatedProps}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>

      {/* Center Label */}
      <View style={styles.labelContainer}>
        {showPercentage && (
          <Text
            style={[
              styles.percentage,
              {
                fontFamily: auroraTheme.typography.fontFamily.heading,
                fontSize: size * 0.2,
                color: uiTokens.colors.textPrimary,
              },
            ]}
          >
            {Math.round(progress)}%
          </Text>
        )}
        {label && (
          <Text
            style={[
              styles.label,
              {
                fontFamily: auroraTheme.typography.fontFamily.body,
                fontSize: size * 0.1,
                color: uiTokens.colors.textSecondary,
              },
            ]}
          >
            {label}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  labelContainer: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  percentage: {
    fontWeight: "700",
    letterSpacing: -1,
  },
  label: {
    marginTop: 4,
    textAlign: "center",
    fontWeight: "500",
  },
});
