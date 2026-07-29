/**
 * AnimatedCounter Component - Operational Numeric Feedback
 *
 * Animated number counter with smooth transitions
 * Features:
 * - Reduced-motion aware counting animation
 * - Customizable duration
 * - Number formatting
 * - Color transitions
 */

import React, { useEffect } from "react";
import { Text, TextStyle, StyleProp } from "react-native";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useUiTokens } from "@/hooks/useUiTokens";
import { getOperationalMotionDuration } from "@/utils/motion";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  style?: StyleProp<TextStyle>;
  prefix?: string;
  suffix?: string;
  decimalPlaces?: number;
  formatNumber?: boolean;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  duration = 1000,
  style,
  prefix = "",
  suffix = "",
  decimalPlaces = 0,
  formatNumber = true,
}) => {
  const uiTokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();
  const governedDuration = getOperationalMotionDuration(uiTokens, "slow", prefersReducedMotion);
  const resolvedDuration = governedDuration === 0 ? 0 : Math.min(duration, governedDuration);
  const [displayValue, setDisplayValue] = React.useState("0");

  // Use a simple interval-based approach for display
  useEffect(() => {
    let animationFrame: number | null = null;
    const formatDisplayValue = (nextValue: number) => {
      let formatted = nextValue.toFixed(decimalPlaces);
      if (formatNumber && decimalPlaces === 0) {
        formatted = Math.round(nextValue).toLocaleString();
      }
      setDisplayValue(`${prefix}${formatted}${suffix}`);
    };

    if (resolvedDuration === 0) {
      formatDisplayValue(value);
      return undefined;
    }

    const startValue = 0;
    const endValue = value;
    const startTime = Date.now();

    const updateDisplay = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / resolvedDuration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (endValue - startValue) * eased;

      formatDisplayValue(currentValue);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(updateDisplay);
      }
    };

    animationFrame = requestAnimationFrame(updateDisplay);

    return () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [value, resolvedDuration, prefix, suffix, decimalPlaces, formatNumber]);

  return (
    <Text
      style={[
        {
          fontSize: 32,
          color: uiTokens.colors.textPrimary,
          fontWeight: "800",
          fontVariant: ["tabular-nums"],
        },
        style,
      ]}
    >
      {displayValue}
    </Text>
  );
};


