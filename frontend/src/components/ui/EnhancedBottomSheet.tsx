/**
 * EnhancedBottomSheet Component
 *
 * Tokenized compatibility bottom sheet with gesture support and reduced-motion handling.
 */

import React, { useCallback, useEffect, useMemo } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useUiTokens } from "@/hooks/useUiTokens";
import { zIndex as uiZIndex } from "@/theme/designTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";
import { getOperationalMotionDuration } from "@/utils/motion";

type SnapPoint = number | `${number}%`;

interface EnhancedBottomSheetProps {
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  snapPoints?: SnapPoint[];
  initialSnapIndex?: number;
  title?: string;
  showHandle?: boolean;
  enableBackdrop?: boolean;
  backdropOpacity?: number;
}

type BottomSheetTokens = ReturnType<typeof useUiTokens>;

export const EnhancedBottomSheet: React.FC<EnhancedBottomSheetProps> = ({
  children,
  isOpen,
  onClose,
  snapPoints = ["50%", "90%"],
  initialSnapIndex = 0,
  title,
  showHandle = true,
  enableBackdrop = true,
  backdropOpacity = 0.5,
}) => {
  const uiTokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const { height: screenHeight } = useWindowDimensions();
  const transitionDuration = getOperationalMotionDuration(uiTokens, "slow", prefersReducedMotion);

  const parseSnapPoint = useCallback(
    (point: SnapPoint): number => {
      if (typeof point === "number") {
        return point;
      }
      const percentage = parseFloat(point) / 100;
      return screenHeight * percentage;
    },
    [screenHeight]
  );

  const parsedSnapPoints = useMemo(
    () => snapPoints.map(parseSnapPoint).sort((a, b) => a - b),
    [snapPoints, parseSnapPoint]
  );

  const translateY = useSharedValue(screenHeight);
  const contextY = useSharedValue(0);
  const activeIndex = useSharedValue(initialSnapIndex);

  const maxTranslateY = screenHeight - (parsedSnapPoints[parsedSnapPoints.length - 1] ?? 0);
  const minTranslateY = screenHeight - (parsedSnapPoints[0] ?? 0);

  const triggerHaptic = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      const targetY = screenHeight - (parsedSnapPoints[initialSnapIndex] ?? 0);
      translateY.value = prefersReducedMotion
        ? targetY
        : withSpring(targetY, {
            damping: 20,
            stiffness: 150,
            mass: 0.5,
          });
      activeIndex.value = initialSnapIndex;
    } else {
      translateY.value = prefersReducedMotion
        ? screenHeight
        : withTiming(screenHeight, { duration: transitionDuration });
    }
  }, [
    isOpen,
    initialSnapIndex,
    parsedSnapPoints,
    translateY,
    activeIndex,
    screenHeight,
    prefersReducedMotion,
    transitionDuration,
  ]);

  const findNearestSnapPoint = (currentY: number): number => {
    let nearestIndex = 0;
    let minDistance = Math.abs(screenHeight - (parsedSnapPoints[0] ?? 0) - currentY);

    parsedSnapPoints.forEach((point, index) => {
      const targetY = screenHeight - point;
      const distance = Math.abs(targetY - currentY);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = index;
      }
    });

    return nearestIndex;
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      contextY.value = translateY.value;
    })
    .onUpdate((event) => {
      const newY = contextY.value + event.translationY;
      translateY.value = Math.max(maxTranslateY, Math.min(screenHeight, newY));
    })
    .onEnd((event) => {
      const currentY = translateY.value;
      const velocity = event.velocityY;

      if (velocity > 500 || currentY > minTranslateY + 50) {
        translateY.value = prefersReducedMotion
          ? screenHeight
          : withSpring(screenHeight, {
              velocity,
              damping: 20,
              stiffness: 150,
            });
        runOnJS(onClose)();
        return;
      }

      const nearestIndex = findNearestSnapPoint(currentY);
      const targetY = screenHeight - (parsedSnapPoints[nearestIndex] ?? 0);

      translateY.value = prefersReducedMotion
        ? targetY
        : withSpring(targetY, {
            velocity,
            damping: 20,
            stiffness: 150,
          });

      if (nearestIndex !== activeIndex.value) {
        activeIndex.value = nearestIndex;
        runOnJS(triggerHaptic)();
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [screenHeight, minTranslateY],
      [0, backdropOpacity],
      Extrapolation.CLAMP
    ),
  }));

  const handleIndicatorStyle = useAnimatedStyle(() => ({
    width: interpolate(translateY.value, [maxTranslateY, minTranslateY], [60, 40], Extrapolation.CLAMP),
  }));

  if (!isOpen) return null;

  return (
    <View style={styles.overlay}>
      {enableBackdrop && (
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close bottom sheet"
          />
        </Animated.View>
      )}

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.sheet, { height: screenHeight }, sheetStyle]}>
          {showHandle && (
            <View style={styles.handleContainer}>
              <Animated.View style={[styles.handle, handleIndicatorStyle]} />
            </View>
          )}

          {title && (
            <View style={styles.titleContainer}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity
                {...getAccessibleButtonProps({ label: `Close ${title}` })}
                onPress={onClose}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.content}>{children}</View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const createStyles = (uiTokens: BottomSheetTokens) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: uiZIndex.modal,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colorWithAlpha(uiTokens.colors.overlay, 0.72),
    },
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      backgroundColor: uiTokens.colors.surface,
      borderTopLeftRadius: uiTokens.radius.xl,
      borderTopRightRadius: uiTokens.radius.xl,
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
      overflow: "hidden",
      ...uiTokens.shadows.md,
    },
    handleContainer: {
      alignItems: "center",
      paddingTop: uiTokens.spacing.md,
      paddingBottom: uiTokens.spacing.sm,
    },
    handle: {
      height: 5,
      backgroundColor: uiTokens.colors.textMuted,
      borderRadius: uiTokens.radius.full,
    },
    titleContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: uiTokens.spacing.lg,
      paddingVertical: uiTokens.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: uiTokens.colors.border,
    },
    title: {
      flex: 1,
      fontSize: 18,
      fontWeight: "600",
      color: uiTokens.colors.textPrimary,
    },
    closeButton: {
      ...getMinimumTouchTargetStyle(),
      borderRadius: uiTokens.radius.md,
      backgroundColor: colorWithAlpha(uiTokens.colors.textMuted, 0.12),
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: uiTokens.spacing.sm,
    },
    closeButtonText: {
      fontSize: 14,
      color: uiTokens.colors.textSecondary,
      fontWeight: "600",
    },
    content: {
      flex: 1,
      padding: uiTokens.spacing.lg,
    },
  });

export default EnhancedBottomSheet;
