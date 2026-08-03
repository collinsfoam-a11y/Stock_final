/**
 * AnimatedPressable Component
 * Modern pressable with spring animations inspired by native-springs
 * Provides tactile feedback with scale and opacity animations
 */

import React, { useCallback } from "react";
import {
  Pressable,
  PressableProps,
  StyleSheet,
  ViewStyle,
  Animated as RNAnimated,
  StyleProp,
  Platform,
} from "react-native";
import Reanimated from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { duration, radius, touchTargets } from "@/theme/unified";
import { supportsNativeAnimationDriver } from "@/utils/animation";
import { getAccessibleButtonProps } from "@/utils/accessibility";
import { getOperationalMotionDuration } from "@/utils/motion";
import { useUiTokens } from "@/hooks/useUiTokens";

interface AnimatedPressableProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  scaleValue?: number;
  hapticFeedback?: "light" | "medium" | "heavy" | "none";
  children: React.ReactNode;
}

export const AnimatedPressable: React.FC<AnimatedPressableProps> = ({
  style,
  scaleValue = 0.97,
  hapticFeedback = "light",
  children,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  hitSlop,
  ...props
}) => {
  const uiTokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();
  const animatedScale = React.useRef(new RNAnimated.Value(1)).current;
  const animatedOpacity = React.useRef(new RNAnimated.Value(1)).current;
  const pressInDuration = getOperationalMotionDuration(uiTokens, "instant", prefersReducedMotion);
  const pressOutDuration = getOperationalMotionDuration(uiTokens, "fast", prefersReducedMotion);
  const helperHitSlop = typeof hitSlop === "object" && hitSlop !== null ? hitSlop : undefined;
  const defaultButtonProps =
    onPress && accessibilityLabel
      ? getAccessibleButtonProps({
          label: accessibilityLabel,
          disabled: disabled ?? undefined,
          hitSlop: helperHitSlop,
        })
      : null;

  const handlePressIn = useCallback(
    (event: any) => {
      if (prefersReducedMotion) {
        animatedScale.setValue(scaleValue);
        animatedOpacity.setValue(0.9);
        onPressIn?.(event);
        return;
      }

      // Spring animation for natural feel
      RNAnimated.parallel([
        RNAnimated.spring(animatedScale, {
          toValue: scaleValue,
          useNativeDriver: supportsNativeAnimationDriver,
          speed: 50,
          bounciness: 4,
        }),
        RNAnimated.timing(animatedOpacity, {
          toValue: 0.9,
          duration: pressInDuration,
          useNativeDriver: supportsNativeAnimationDriver,
        }),
      ]).start();

      // Haptic feedback
      if (Platform.OS !== "web" && hapticFeedback !== "none") {
        const impactStyle =
          hapticFeedback === "light"
            ? Haptics.ImpactFeedbackStyle.Light
            : hapticFeedback === "medium"
              ? Haptics.ImpactFeedbackStyle.Medium
              : Haptics.ImpactFeedbackStyle.Heavy;
        Haptics.impactAsync(impactStyle);
      }

      onPressIn?.(event);
    },
    [
      animatedScale,
      animatedOpacity,
      scaleValue,
      pressInDuration,
      hapticFeedback,
      onPressIn,
      prefersReducedMotion,
    ]
  );

  const handlePressOut = useCallback(
    (event: any) => {
      if (prefersReducedMotion) {
        animatedScale.setValue(1);
        animatedOpacity.setValue(1);
        onPressOut?.(event);
        return;
      }

      RNAnimated.parallel([
        RNAnimated.spring(animatedScale, {
          toValue: 1,
          useNativeDriver: supportsNativeAnimationDriver,
          speed: 20,
          bounciness: 8,
        }),
        RNAnimated.timing(animatedOpacity, {
          toValue: 1,
          duration: pressOutDuration,
          useNativeDriver: supportsNativeAnimationDriver,
        }),
      ]).start();

      onPressOut?.(event);
    },
    [animatedScale, animatedOpacity, onPressOut, pressOutDuration, prefersReducedMotion]
  );

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole ?? defaultButtonProps?.accessibilityRole}
      accessibilityState={accessibilityState ?? defaultButtonProps?.accessibilityState}
      hitSlop={hitSlop ?? defaultButtonProps?.hitSlop}
      {...props}
    >
      <Reanimated.View
        style={[
          style,
          {
            transform: [{ scale: animatedScale as any }],
            opacity: (disabled ? 0.5 : animatedOpacity) as any,
          },
        ]}
      >
        {children}
      </Reanimated.View>
    </Pressable>
  );
};

// Convenience wrapper for card-like pressables
export const AnimatedCard: React.FC<AnimatedPressableProps> = (props) => {
  return (
    <AnimatedPressable
      scaleValue={0.98}
      hapticFeedback="light"
      {...props}
      style={[styles.card, props.style]}
    />
  );
};

// Convenience wrapper for button-like pressables
export const AnimatedButton: React.FC<AnimatedPressableProps> = (props) => {
  return <AnimatedPressable scaleValue={0.95} hapticFeedback="medium" {...props} />;
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
});
