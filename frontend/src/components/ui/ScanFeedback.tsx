/**
 * ScanFeedback Component
 *
 * Operational scan acknowledgment with tokenized motion and reduced-motion support.
 */

import React, { useCallback, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, useWindowDimensions, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withDelay,
  withRepeat,
  Easing,
} from "react-native-reanimated";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { zIndex as uiZIndex } from "@/theme/designTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { useUiTokens } from "@/hooks/useUiTokens";
import { getOperationalMotionDuration } from "@/utils/motion";

export type ScanFeedbackType = "success" | "error" | "warning" | "info" | "duplicate";

interface ScanFeedbackProps {
  type: ScanFeedbackType;
  title: string;
  message?: string;
  visible: boolean;
  onDismiss?: () => void;
  duration?: number;
  showIcon?: boolean;
}

const feedbackConfig = {
  success: {
    icon: "checkmark-circle" as const,
    haptic: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  },
  error: {
    icon: "close-circle" as const,
    haptic: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  },
  warning: {
    icon: "warning" as const,
    haptic: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  },
  info: {
    icon: "information-circle" as const,
    haptic: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  },
  duplicate: {
    icon: "copy" as const,
    haptic: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  },
};

export const ScanFeedback: React.FC<ScanFeedbackProps> = ({
  type,
  title,
  message,
  visible,
  onDismiss,
  duration = 2000,
  showIcon = true,
}) => {
  const uiTokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const iconScale = useSharedValue(0);
  const iconRotation = useSharedValue(0);
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.5);

  const config = feedbackConfig[type];
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const feedbackColor = {
    success: uiTokens.colors.success,
    error: uiTokens.colors.error,
    warning: uiTokens.colors.warning,
    info: uiTokens.colors.info,
    duplicate: uiTokens.colors.warning,
  }[type];
  const enterDuration = getOperationalMotionDuration(uiTokens, "fast", prefersReducedMotion);
  const exitDuration = getOperationalMotionDuration(uiTokens, "fast", prefersReducedMotion);
  const pulseDuration = getOperationalMotionDuration(uiTokens, "slow", prefersReducedMotion);
  const dismissDelay = Math.max(duration, pulseDuration);
  const accessibilityLabel = [title, message].filter(Boolean).join(". ");

  const triggerHaptic = useCallback(() => {
    if (Platform.OS !== "web") {
      feedbackConfig[type].haptic();
    }
  }, [type]);

  useEffect(() => {
    if (visible) {
      // Trigger haptic
      triggerHaptic();

      if (prefersReducedMotion) {
        opacity.value = 1;
        scale.value = 1;
        iconScale.value = 1;
        iconRotation.value = 0;
        ringScale.value = 1;
        ringOpacity.value = 0;
      } else {
        opacity.value = withTiming(1, { duration: enterDuration });
        scale.value = withSpring(1, { damping: 12, stiffness: 180 });
        iconScale.value = withDelay(
          enterDuration,
          withSpring(1, { damping: 10, stiffness: 200 })
        );

        if (type === "success") {
          iconRotation.value = withDelay(
            enterDuration,
            withSequence(
              withTiming(-10, { duration: enterDuration }),
              withSpring(0, { damping: 8, stiffness: 200 })
            )
          );
        }

        ringScale.value = withRepeat(
          withSequence(
            withTiming(1.35, { duration: pulseDuration, easing: Easing.out(Easing.ease) }),
            withTiming(1, { duration: enterDuration })
          ),
          2,
          false
        );
        ringOpacity.value = withRepeat(
          withSequence(
            withTiming(0, { duration: pulseDuration }),
            withTiming(0.5, { duration: enterDuration })
          ),
          2,
          false
        );
      }

      // Auto dismiss
      if (onDismiss) {
        const timer = setTimeout(() => {
          if (prefersReducedMotion) {
            opacity.value = 0;
            scale.value = 0;
            iconScale.value = 0;
            onDismiss();
            return;
          }

          opacity.value = withTiming(0, { duration: exitDuration });
          scale.value = withTiming(0.8, { duration: exitDuration });
          iconScale.value = withTiming(0, { duration: enterDuration });
          setTimeout(onDismiss, exitDuration);
        }, dismissDelay);

        return () => clearTimeout(timer);
      }
      return; // Explicit return for the case when onDismiss is not provided
    } else {
      // Reset animations
      scale.value = 0;
      opacity.value = 0;
      iconScale.value = 0;
      return; // All paths must return
    }
  }, [
    visible,
    duration,
    dismissDelay,
    enterDuration,
    exitDuration,
    onDismiss,
    prefersReducedMotion,
    pulseDuration,
    type,
    triggerHaptic,
    opacity,
    scale,
    iconScale,
    iconRotation,
    ringScale,
    ringOpacity,
  ]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }, { rotate: `${iconRotation.value}deg` }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  if (!visible) return null;

  return (
    <View
      style={[styles.overlay, styles.pointerEventsNone]}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[styles.container, { width: screenWidth * 0.7 }, containerStyle]}>
        <View
          style={[
            styles.panel,
            {
              backgroundColor: uiTokens.colors.surfaceElevated,
              borderColor: colorWithAlpha(feedbackColor, 0.3),
            },
          ]}
        >
          {/* Pulse ring */}
          <Animated.View
            style={[
              styles.ring,
              {
                borderColor: colorWithAlpha(feedbackColor, 0.3),
              },
              ringStyle,
            ]}
          />

          {/* Icon */}
          {showIcon && (
            <Animated.View style={iconStyle}>
              <View style={styles.iconContainer}>
                <Ionicons name={config.icon} size={64} color={feedbackColor} />
              </View>
            </Animated.View>
          )}

          {/* Text content */}
          <Text style={[styles.title, { color: uiTokens.colors.textPrimary }]}>{title}</Text>
          {message && (
            <Text style={[styles.message, { color: uiTokens.colors.textSecondary }]}>
              {message}
            </Text>
          )}
        </View>
      </Animated.View>
    </View>
  );
};

type ScanFeedbackTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: ScanFeedbackTokens) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: uiTokens.colors.overlay,
      zIndex: uiZIndex.toast,
    },
    pointerEventsNone: {
      pointerEvents: "none",
    },
    container: {
      maxWidth: 280,
      borderRadius: uiTokens.radius.xl,
      overflow: "hidden",
      ...uiTokens.shadows.md,
    },
    panel: {
      padding: uiTokens.spacing["2xl"],
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    ring: {
      position: "absolute",
      width: 120,
      height: 120,
      borderRadius: uiTokens.radius.full,
      borderWidth: 3,
    },
    iconContainer: {
      marginBottom: uiTokens.spacing.lg,
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    },
    message: {
      fontSize: 14,
      textAlign: "center",
      marginTop: uiTokens.spacing.sm,
    },
  });

export default ScanFeedback;
