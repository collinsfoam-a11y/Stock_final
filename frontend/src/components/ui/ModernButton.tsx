/**
 * Modern Button Component - Enhanced UI/UX
 * Features:
 * - Multiple variants (primary, secondary, outline, ghost, danger)
 * - Size options (small, medium, large)
 * - Smooth animations and micro-interactions
 * - Loading states with spinners
 * - Icon support (left/right)
 * - Full accessibility support
 */

import React from "react";
import { Text, ActivityIndicator, ViewStyle, TextStyle, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  legacyColors as modernColors,
  legacyAnimations as modernAnimations,
} from "@/theme/unified";
import {
  colors,
  semanticColors,
  radius,
  spacing,
  textStyles,
  touchTargets,
} from "@/theme/unified";
import { useThemeContextSafe } from "../../context/ThemeContext";
import { getDecorativeIconProps } from "@/utils/accessibility";
import { haptics } from "@/services/haptics";

import { AppTouchable } from "@/components/ui/AppTouchable";

const AnimatedAppTouchable = Animated.createAnimatedComponent(AppTouchable);

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "tertiary";
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
  testID,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const themeContext = useThemeContextSafe();
  const theme = themeContext?.themeLegacy;
  const themedColors = theme?.colors;
  const primaryBackground = theme?.isDark ? colors.primary[500] : semanticColors.button.primary;
  const primaryBorder = theme?.isDark ? colors.primary[600] : semanticColors.button.primary;
  const secondaryBackground = themedColors?.surfaceElevated ?? semanticColors.button.secondary;
  const surfaceBorder = themedColors?.border ?? semanticColors.border.default;
  const primaryText = colors.white;
  const bodyText = themedColors?.textPrimary ?? semanticColors.text.primary;
  const secondaryText = themedColors?.textSecondary ?? semanticColors.button.secondaryText;
  const accentText = themedColors?.accent ?? semanticColors.text.link;
  const dangerBackground = themedColors?.error ?? semanticColors.status.error;

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
      scale.value = withSpring(modernAnimations.scale.pressed, {
        damping: modernAnimations.easing.spring.damping,
        stiffness: modernAnimations.easing.spring.stiffness,
      });
      opacity.value = withTiming(modernAnimations.opacity.pressed, {
        duration: modernAnimations.duration.fast,
      });
    }
  };

  const handlePressOut = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(1, {
        damping: modernAnimations.easing.spring.damping,
        stiffness: modernAnimations.easing.spring.stiffness,
      });
      opacity.value = withTiming(1, {
        duration: modernAnimations.duration.fast,
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
      tertiary: {
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
      tertiary: secondaryText,
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
      <Ionicons
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
              ? theme
                ? theme.colors.accent
                : modernColors.primary[500]
              : primaryText
          }
        />
      );
    }

    return (
      <>
        {iconPosition === "left" && renderIcon()}
        <Text style={[getTextStyles(), textStyle]}>{title}</Text>
        {iconPosition === "right" && renderIcon()}
      </>
    );
  };

  // Render button based on variant
  const renderButton = () => {
    const buttonStyle = [getButtonStyles(), style];
    const isWeb = Platform.OS === "web";
    const Component = isWeb ? AppTouchable : AnimatedAppTouchable;

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

    return <Component {...props}>{renderContent()}</Component>;
  };

  return renderButton();
};
