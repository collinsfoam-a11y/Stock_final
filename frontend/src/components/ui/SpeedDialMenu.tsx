/**
 * SpeedDialMenu Component - Operational UI
 *
 * Floating action button with expandable menu
 * Features:
 * - Token-based action surfaces
 * - Reduced-motion aware expand/collapse animation
 * - Lightweight overlay
 * - Haptic feedback
 */

import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  SharedValue,
} from "react-native-reanimated";
import { zIndex as uiZIndex } from "@/theme/designTokens";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, getTokenShadowStyle, type ThemeTokens } from "@/theme/themeTokens";
import { semanticColors } from "@/theme/legacyCompat";
import { font, gap, radius } from '@/theme/staffUiScale';

export interface SpeedDialAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
  badge?: number;
}

export interface SpeedDialMenuProps {
  actions: SpeedDialAction[];
  mainIcon?: keyof typeof Ionicons.glyphMap;
  mainColor?: string | readonly [string, string, ...string[]];
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// Extracted action item component to comply with React hooks rules
interface SpeedDialActionItemProps {
  action: SpeedDialAction;
  alignRight: boolean;
  index: number;
  animationProgress: SharedValue<number>;
  onPress: (action: SpeedDialAction) => void;
  tokens: ThemeTokens;
}

const SpeedDialActionItem: React.FC<SpeedDialActionItemProps> = ({
  action,
  alignRight,
  index,
  animationProgress,
  onPress,
  tokens,
}) => {
  const actionColor = action.color || tokens.colors.accent;

  const actionStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      animationProgress.value,
      [0, 1],
      [0, -(56 + tokens.spacing.sm) * (index + 1)]
    );
    const opacity = interpolate(animationProgress.value, [0, 0.5, 1], [0, 0.5, 1]);
    const scale = interpolate(animationProgress.value, [0, 1], [0.3, 1]);

    return {
      transform: [{ translateY }, { scale }],
      opacity,
    };
  });

  return (
    <AnimatedTouchable
      style={[
        styles.actionButton,
        alignRight ? styles.actionButtonRight : styles.actionButtonLeft,
        actionStyle,
      ]}
      onPress={() => onPress(action)}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={action.label}
    >
      <View
        style={[
          styles.actionContent,
          !alignRight && styles.actionContentLeft,
          { gap: tokens.spacing.sm },
        ]}
      >
        <View
          style={[
            styles.labelContainer,
            {
              backgroundColor: tokens.colors.surfaceElevated,
              borderColor: tokens.colors.border,
              borderRadius: tokens.radius.md,
              paddingHorizontal: tokens.spacing.md,
              paddingVertical: tokens.spacing.sm,
            },
            getTokenShadowStyle(tokens, "sm"),
          ]}
        >
          <Text
            style={[
              styles.label,
              {
                color: tokens.colors.textPrimary,
              },
            ]}
          >
            {action.label}
          </Text>
        </View>

        <View
          style={[
            styles.iconButton,
            {
              backgroundColor: colorWithAlpha(actionColor, tokens.mode === "dark" ? 0.24 : 0.12),
              borderColor: colorWithAlpha(actionColor, 0.36),
            },
          ]}
        >
          <Ionicons name={action.icon} size={22} color={actionColor} />
          {action.badge !== undefined && action.badge > 0 && (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: tokens.colors.error,
                  borderColor: tokens.colors.surfaceElevated,
                },
              ]}
            >
              <Text style={styles.badgeText}>{action.badge}</Text>
            </View>
          )}
        </View>
      </View>
    </AnimatedTouchable>
  );
};

const SpeedDialMenu: React.FC<SpeedDialMenuProps> = ({
  actions,
  // "flash" distinguishes the quick-actions dial from the navigation
  // drawer FAB, which uses the "menu" glyph in the opposite corner.
  mainIcon = "flash",
  mainColor,
  position = "bottom-right",
}) => {
  const tokens = useUiTokens();
  const [isOpen, setIsOpen] = useState(false);
  const animationProgress = useSharedValue(0);
  const mainRotation = useSharedValue(0);
  const resolvedMainColor = Array.isArray(mainColor)
    ? mainColor[0]
    : mainColor || tokens.colors.accentStrong;

  useEffect(() => {
    if (isOpen) {
      animationProgress.value = tokens.motion.enabled ? withSpring(1, { damping: 18 }) : 1;
      mainRotation.value = tokens.motion.enabled ? withSpring(135, { damping: 14 }) : 135;
    } else {
      animationProgress.value = tokens.motion.enabled
        ? withTiming(0, { duration: tokens.motion.fast })
        : 0;
      mainRotation.value = tokens.motion.enabled ? withSpring(0, { damping: 14 }) : 0;
    }
  }, [animationProgress, isOpen, mainRotation, tokens.motion.enabled, tokens.motion.fast]);

  const toggleMenu = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setIsOpen(!isOpen);
  };

  const handleActionPress = (action: SpeedDialAction) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    action.onPress();
    setIsOpen(false);
  };

  const mainRotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${mainRotation.value}deg` }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: animationProgress.value,
  }));
  const alignRight = position.endsWith("right");

  const getPositionStyles = () => {
    const base = { position: "absolute" as const };
    switch (position) {
      case "bottom-right":
        return {
          ...base,
          bottom: tokens.spacing.lg,
          right: tokens.spacing.lg,
        };
      case "bottom-left":
        return {
          ...base,
          bottom: tokens.spacing.lg,
          left: tokens.spacing.lg,
        };
      case "top-right":
        return {
          ...base,
          top: tokens.spacing.lg,
          right: tokens.spacing.lg,
        };
      case "top-left":
        return {
          ...base,
          top: tokens.spacing.lg,
          left: tokens.spacing.lg,
        };
    }
  };

  return (
    <>
      {isOpen ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.backdrop,
            { backgroundColor: colorWithAlpha(tokens.colors.overlay, 0.28) },
            backdropStyle,
          ]}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={toggleMenu}
            activeOpacity={1}
          />
        </Animated.View>
      ) : null}

      <View style={[styles.container, getPositionStyles()]}>
        {actions.map((action, index) => (
          <SpeedDialActionItem
            key={index}
            action={action}
            alignRight={alignRight}
            index={index}
            animationProgress={animationProgress}
            onPress={handleActionPress}
            tokens={tokens}
          />
        ))}

        <TouchableOpacity
          style={[
            styles.mainButton,
            {
              backgroundColor: resolvedMainColor,
              borderColor: colorWithAlpha(resolvedMainColor, 0.5),
            },
            getTokenShadowStyle(tokens, "md"),
          ]}
          onPress={toggleMenu}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={isOpen ? "Close quick actions" : "Open quick actions"}
        >
          <Animated.View style={mainRotationStyle}>
            <Ionicons name={mainIcon} size={28} color={semanticColors.text.inverse} />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    zIndex: uiZIndex.toast,
  },
  backdrop: {
    zIndex: uiZIndex.overlay,
  },
  mainButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
  },
  actionButton: {
    position: "absolute",
    bottom: 0,
    width: 280,
  },
  actionButtonRight: {
    right: 0,
    alignItems: "flex-end",
  },
  actionButtonLeft: {
    left: 0,
    alignItems: "flex-start",
  },
  actionContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionContentLeft: {
    flexDirection: "row-reverse",
  },
  labelContainer: {
    borderWidth: 1,
    maxWidth: 220,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: radius["2xl"],
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: gap.sm,
    borderWidth: 2,
  },
  badgeText: {
    color: semanticColors.text.inverse,
    fontSize: 10,
    fontWeight: "700",
  },
});

export { SpeedDialMenu };
