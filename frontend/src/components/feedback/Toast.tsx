import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useUiTokens } from "../../hooks/useUiTokens";
import { getTokenShadowStyle } from "../../theme/themeTokens";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info" | "warning";
  visible: boolean;
  onHide: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = "info",
  visible,
  onHide,
  duration = 3000,
}) => {
  const tokens = useUiTokens();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-16);
  const scale = useSharedValue(0.96);

  useEffect(() => {
    if (visible) {
      if (!tokens.motion.enabled) {
        opacity.value = 1;
        translateY.value = 0;
        scale.value = 1;
      } else {
        opacity.value = withTiming(1, {
          duration: tokens.motion.normal,
          easing: Easing.out(Easing.ease),
        });
        translateY.value = withSpring(0, {
          damping: 15,
          stiffness: 150,
        });
        scale.value = withSpring(1, {
          damping: 15,
          stiffness: 150,
        });
      }

      const timer = setTimeout(() => {
        if (!tokens.motion.enabled) {
          onHide();
          return;
        }

        opacity.value = withTiming(0, {
          duration: tokens.motion.normal,
          easing: Easing.in(Easing.ease),
        });
        translateY.value = withTiming(-16, {
          duration: tokens.motion.normal,
          easing: Easing.in(Easing.ease),
        });
        scale.value = withTiming(
          0.96,
          {
            duration: tokens.motion.normal,
            easing: Easing.in(Easing.ease),
          },
          () => {
            runOnJS(onHide)();
          }
        );
      }, duration);

      return () => clearTimeout(timer);
    } else {
      opacity.value = 0;
      translateY.value = -16;
      scale.value = 0.96;
      return undefined;
    }
  }, [
    visible,
    duration,
    onHide,
    opacity,
    scale,
    tokens.motion.enabled,
    tokens.motion.normal,
    translateY,
  ]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }, { scale: scale.value }],
    };
  });

  if (!visible) return null;

  const statusColor = getToastColor(type, tokens);
  const statusBackground = withAlpha(statusColor, tokens.mode === "dark" ? 0.18 : 0.1);

  const getIcon = () => {
    switch (type) {
      case "success":
        return "checkmark-circle";
      case "error":
        return "close-circle";
      case "warning":
        return "warning";
      default:
        return "information-circle";
    }
  };

  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${type} notification: ${message}`}
      aria-live="polite"
      {...({ "aria-atomic": true } as const)}
      style={[
        styles.container,
        {
          backgroundColor: tokens.colors.surfaceElevated,
          borderColor: tokens.colors.border,
          borderLeftColor: statusColor,
        },
        getTokenShadowStyle(tokens, "md"),
        animatedStyle,
      ]}
    >
      <View style={[styles.iconBadge, { backgroundColor: statusBackground }]}>
        <Ionicons name={getIcon()} size={19} color={statusColor} />
      </View>
      <Text style={[styles.message, { color: tokens.colors.textPrimary }]}>{message}</Text>
    </Animated.View>
  );
};

const getToastColor = (type: ToastProps["type"], tokens: ReturnType<typeof useUiTokens>) => {
  switch (type) {
    case "success":
      return tokens.colors.success;
    case "error":
      return tokens.colors.error;
    case "warning":
      return tokens.colors.warning;
    default:
      return tokens.colors.info;
  }
};

const withAlpha = (color: string, alpha: number): string => {
  const sanitized = color.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(sanitized)) {
    return color;
  }

  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 4,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -1,
  },
  message: {
    marginLeft: 10,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
});
