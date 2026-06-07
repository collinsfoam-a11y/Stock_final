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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { modernColors, modernAnimations } from "@/theme/unified";
import {
  colors,
  semanticColors,
  radius,
  spacing,
  textStyles,
  touchTargets,
} from "@/theme/legacyCompat";
import { useThemeContextSafe } from "../../context/ThemeContext";
import { getDecorativeIconProps } from "@/utils/accessibility";
import { haptics } from "@/services/haptics";

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

export interface ModernButtonProps {
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
      const colors =
        gradientColors || (theme ? theme.gradients.primary : modernColors.gradients.primary);
      return (
        <Component {...props}>
          <LinearGradient
            colors={colors as unknown as readonly [string, string, ...string[]]}
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
                  backgroundColor:
                    themedColors?.glass ??
                    (theme?.isDark ? "rgba(22, 27, 34, 0.85)" : "rgba(255, 255, 255, 0.85)"),
                  borderColor: surfaceBorder,
                },
              ]}
            >
              {renderContent()}
            </View>
          ) : (
            <BlurView intensity={20} tint="dark" style={styles.blur}>
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
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
});

export default ModernButton;
