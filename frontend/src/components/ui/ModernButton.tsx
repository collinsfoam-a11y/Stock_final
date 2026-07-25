/**
 * Modern Button Component - Enhanced UI/UX
 * Features:
 * - Multiple variants (primary, secondary, outline, ghost, danger)
 * - Size options (small, medium, large)
 * - Smooth animations and micro-interactions
 * - Loading states with spinners
 * - Icon support (left/right)
 * - Full accessibility support
 * - Gradient support
 * - Glassmorphism variant
 */

import React from "react";
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  Platform,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppIcon } from "./AppIcon";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  colors,
  radius,
  spacing,
  textStyles,
  touchTargets,
} from "@/theme/legacyCompat";
import { colorWithAlpha } from "@/theme/themeTokens";
import { useUiTokens } from "@/hooks/useUiTokens";
import { getDecorativeIconProps } from "@/utils/accessibility";
import { haptics } from "@/services/haptics";
import { maxFontSizeMultiplierFor } from "@/theme/appleTypography";

const ANIMATION_TOKENS = {
  duration: {
    fast: 150,
  },
  easing: {
    spring: {
      damping: 15,
      stiffness: 300,
      mass: 1,
    },
  },
  scale: {
    pressed: 0.95,
  },
  opacity: {
    pressed: 0.8,
  },
} as const;

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "glass"
  | "gradient";
export type ButtonSize = "small" | "medium" | "large";

interface ModernButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  gradientColors?: string[];
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export const ModernButton: React.FC<ModernButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  size = "medium",
  disabled = false,
  loading = false,
  icon,
  iconPosition = "left",
  fullWidth = false,
  style,
  textStyle,
  gradientColors,
  testID,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const uiTokens = useUiTokens();
  const primaryBackground = uiTokens.colors.accent;
  const primaryBorder = uiTokens.colors.accent;
  const secondaryBackground = uiTokens.colors.surfaceElevated;
  const surfaceBorder = uiTokens.colors.border;
  const primaryText = colors.white;
  const bodyText = uiTokens.colors.textPrimary;
  const secondaryText = uiTokens.colors.textSecondary;
  const accentText = uiTokens.colors.accent;
  const dangerBackground = uiTokens.colors.error;

  // Animation values
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  // Animated styles
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  // Press handlers with animations
  const handlePressIn = () => {
    if (!disabled && !loading) {
      void haptics.light();
      scale.value = withSpring(ANIMATION_TOKENS.scale.pressed, {
        damping: ANIMATION_TOKENS.easing.spring.damping,
        stiffness: ANIMATION_TOKENS.easing.spring.stiffness,
      });
      opacity.value = withTiming(ANIMATION_TOKENS.opacity.pressed, {
        duration: ANIMATION_TOKENS.duration.fast,
      });
    }
  };

  const handlePressOut = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(1, {
        damping: ANIMATION_TOKENS.easing.spring.damping,
        stiffness: ANIMATION_TOKENS.easing.spring.stiffness,
      });
      opacity.value = withTiming(1, {
        duration: ANIMATION_TOKENS.duration.fast,
      });
    }
  };

  // Get button styles based on variant and size
  const getButtonStyles = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      borderRadius: radius.sm,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: getSizeConfig().height,
      paddingHorizontal: getSizeConfig().paddingHorizontal,
      ...(fullWidth && { width: "100%" }),
      ...(disabled && { opacity: 0.5 }),
    };

    // Variant-specific styles using semantic tokens from DESIGN.md
    const variantStyles: Record<ButtonVariant, ViewStyle> = {
      primary: {
        backgroundColor: primaryBackground,
        borderWidth: 1,
        borderColor: primaryBorder,
      },
      secondary: {
        backgroundColor: secondaryBackground,
        borderWidth: 1,
        borderColor: surfaceBorder,
      },
      outline: {
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: surfaceBorder,
      },
      ghost: {
        backgroundColor: "transparent",
      },
      danger: {
        backgroundColor: dangerBackground,
        borderWidth: 1,
        borderColor: dangerBackground,
      },
      glass: {
        backgroundColor: "transparent",
      },
      gradient: {
        backgroundColor: "transparent",
      },
    };

    return {
      ...baseStyle,
      ...variantStyles[variant],
    };
  };

  // Get text styles using semantic tokens
  const getTextStyles = (): TextStyle => {
    const baseStyle: TextStyle = {
      ...getSizeConfig().typography,
      fontWeight: "600" as const,
    };

    const variantTextColors: Record<ButtonVariant, string> = {
      primary: primaryText,
      secondary: secondaryText,
      outline: bodyText,
      ghost: accentText,
      danger: colors.white,
      glass: bodyText,
      gradient: colors.white,
    };

    return {
      ...baseStyle,
      color: variantTextColors[variant],
    };
  };

  // Get icon color
  const getIconColor = (): string => {
    if (variant === "outline") return bodyText;
    if (variant === "ghost") return accentText;
    if (variant === "secondary") return secondaryText;
    if (variant === "glass") return bodyText;
    return primaryText;
  };

  // Size configuration aligned with DESIGN.md
  function getSizeConfig() {
    const configs = {
      small: {
        height: 36,
        paddingHorizontal: spacing.md,
        typography: textStyles.button,
        iconSize: 16,
      },
      medium: {
        height: touchTargets.minimum,
        paddingHorizontal: spacing.lg,
        typography: textStyles.button,
        iconSize: 20,
      },
      large: {
        height: touchTargets.large,
        paddingHorizontal: spacing.xl,
        typography: textStyles.button,
        iconSize: 24,
      },
    };
    return configs[size];
  }

  const sizeConfig = getSizeConfig();
  const decorativeIconProps = getDecorativeIconProps();

  // Render icon
  const renderIcon = () => {
    if (!icon || loading) return null;

    return (
      <AppIcon
        {...decorativeIconProps}
        name={icon}
        size={sizeConfig.iconSize}
        color={getIconColor()}
      />
    );
  };

  // Render button content
  const renderContent = () => {
    if (loading) {
      return (
        <ActivityIndicator
          size="small"
          color={
            variant === "outline" || variant === "ghost"
              ? uiTokens.colors.accent
              : primaryText
          }
        />
      );
    }

    return (
      <>
        {iconPosition === "left" && renderIcon()}
        <Text
          style={[getTextStyles(), textStyle]}
          maxFontSizeMultiplier={maxFontSizeMultiplierFor("compact")}
        >
          {title}
        </Text>
        {iconPosition === "right" && renderIcon()}
      </>
    );
  };

  // Render button based on variant
  const renderButton = () => {
    const buttonStyle = [getButtonStyles(), style];
    const isWeb = Platform.OS === "web";
    const Component = isWeb ? TouchableOpacity : AnimatedTouchableOpacity;

    const finalAccessibilityLabel = loading
      ? `Loading, ${accessibilityLabel || title}`
      : accessibilityLabel || title;

    const props = {
      onPress,
      onPressIn: handlePressIn,
      onPressOut: handlePressOut,
      disabled: disabled || loading,
      activeOpacity: isWeb ? 0.8 : 1,
      style: isWeb ? buttonStyle : [animatedStyle, buttonStyle],
      testID,
      accessibilityLabel: finalAccessibilityLabel,
      accessibilityHint,
      accessibilityRole: "button" as const,
      accessibilityState: {
        disabled: disabled || loading,
        busy: loading,
      },
    };

    if (variant === "gradient") {
      const gradientPalette =
        gradientColors || uiTokens.gradients.primary;
      return (
        <Component {...props}>
          <LinearGradient
            colors={gradientPalette as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradient}
          >
            {renderContent()}
          </LinearGradient>
        </Component>
      );
    }

    if (variant === "glass") {
      return (
        <Component {...props}>
          {isWeb ? (
            <View
              style={[
                styles.blur,
                {
                  backgroundColor: colorWithAlpha(
                    uiTokens.colors.surfaceElevated,
                    uiTokens.mode === "dark" ? 0.9 : 0.85
                  ),
                  borderColor: surfaceBorder,
                },
              ]}
            >
              {renderContent()}
            </View>
          ) : (
            <BlurView
              intensity={20}
              tint={uiTokens.mode === "dark" ? "dark" : "light"}
              style={styles.blur}
            >
              {renderContent()}
            </BlurView>
          )}
        </Component>
      );
    }

    return <Component {...props}>{renderContent()}</Component>;
  };

  return renderButton();
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: "100%",
    width: "100%",
  },
  blur: {
    flex: 1,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: "100%",
    width: "100%",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    // Faint invariant hairline for the dark BlurView glass edge; web glass
    // overrides borderColor inline with the themed surfaceBorder.
    borderColor: colorWithAlpha(colors.white, 0.1),
  },
});

export default ModernButton;
