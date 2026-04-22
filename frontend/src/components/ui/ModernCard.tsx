/**
 * Modern Card Component - Enhanced UI/UX
 * Features:
 * - Glassmorphism support
 * - Smooth hover/press animations
 * - Multiple elevation levels
 * - Gradient backgrounds
 * - Interactive states
 * - Better shadows and borders
 */

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  StyleProp,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  modernColors,
  modernSpacing,
  modernBorderRadius,
  modernShadows,
  modernTypography,
  modernAnimations,
} from "../../styles/modernDesignSystem";
import { useThemeContextSafe } from "../../context/ThemeContext";

const AnimatedTouchableOpacity =
  Animated.createAnimatedComponent(TouchableOpacity);
const AnimatedView = Animated.createAnimatedComponent(View);

export type CardVariant =
  | "default"
  | "elevated"
  | "glass"
  | "gradient"
  | "outlined";
export type CardElevation = "none" | "sm" | "md" | "lg";

interface ModernCardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onPress?: () => void;
  variant?: CardVariant;
  elevation?: CardElevation;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  gradientColors?: string[];
  icon?: keyof typeof Ionicons.glyphMap;
  footer?: React.ReactNode;
  testID?: string;
  onLongPress?: () => void;
  delayLongPress?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  contentStyle?: StyleProp<ViewStyle>;
  intensity?: number;
}

export const ModernCard: React.FC<ModernCardProps> = ({
  children,
  title,
  subtitle,
  onPress,
  variant = "default",
  elevation = "md",
  padding,
  style,
  gradientColors,
  icon,
  footer,
  testID,
  onLongPress,
  delayLongPress,
  accessibilityLabel,
  accessibilityHint,
  contentStyle,
  intensity = 20,
}) => {
  const themeContext = useThemeContextSafe();
  const theme = themeContext?.theme;

  const actualPadding =
    padding !== undefined
      ? padding
      : theme
        ? theme.spacing.md
        : modernSpacing.cardPadding;

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

  // Press handlers
  const handlePressIn = () => {
    if (onPress) {
      scale.value = withSpring(0.98, {
        damping: modernAnimations.easing.spring.damping,
        stiffness: modernAnimations.easing.spring.stiffness,
      });
      opacity.value = withTiming(0.9, {
        duration: modernAnimations.duration.fast,
      });
    }
  };

  const handlePressOut = () => {
    if (onPress) {
      scale.value = withSpring(1, {
        damping: modernAnimations.easing.spring.damping,
        stiffness: modernAnimations.easing.spring.stiffness,
      });
      opacity.value = withTiming(1, {
        duration: modernAnimations.duration.fast,
      });
    }
  };

  // Memoized dynamic styles
  const dynamicStyles = React.useMemo(() => {
    const spacing = theme?.spacing ?? modernSpacing;
    const borderLight = theme?.colors.border.light ?? modernColors.border.light;
    const borderMedium = theme?.colors.border.medium ?? modernColors.border.medium;
    const paperBackground = theme?.colors.background.paper ?? modernColors.background.paper;
    const primaryText = theme?.colors.text.primary ?? modernColors.text.primary;
    const secondaryText = theme?.colors.text.secondary ?? modernColors.text.secondary;
    const glassBackground = theme?.colors.glass ?? "rgba(255, 255, 255, 0.1)";
    const glassBorder = theme?.colors.border.light ?? "rgba(255, 255, 255, 0.15)";
    const shadowMap = theme
      ? {
          none: {},
          sm: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.1,
            shadowRadius: 2,
            elevation: 2,
          },
          md: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 4,
          },
          lg: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.2,
            shadowRadius: 20,
            elevation: 8,
          },
        }
      : modernShadows;

    return StyleSheet.create({
      card: {
        borderRadius: theme?.borderRadius?.lg ?? modernBorderRadius.card,
        overflow: "hidden",
      },
      content: {
        padding: actualPadding,
        flex: 1,
      },
      default: {
        backgroundColor: paperBackground,
        borderWidth: 1,
        borderColor: borderLight,
        ...shadowMap[elevation],
      },
      elevated: {
        backgroundColor: paperBackground,
        ...shadowMap[elevation],
      },
      glass: {
        backgroundColor: glassBackground,
        borderWidth: 1,
        borderColor: glassBorder,
      },
      gradient: {
        backgroundColor: "transparent",
      },
      outlined: {
        backgroundColor: paperBackground,
        borderWidth: 2,
        borderColor: borderMedium,
      },
      title: {
        ...modernTypography.h5,
        color: primaryText,
        marginBottom: spacing.xs,
      },
      subtitle: {
        ...modernTypography.body.small,
        color: secondaryText,
      },
      footer: {
        marginTop: spacing.md,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: borderLight,
      },
      header: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: spacing.md,
      },
      iconContainer: {
        marginRight: spacing.sm,
      },
    });
  }, [theme, elevation, actualPadding]);

  // Render card content
  const renderContent = () => {
    return (
      <View style={[dynamicStyles.content, contentStyle]}>
        {(title || subtitle || icon) && (
          <View style={dynamicStyles.header}>
            {icon && (
              <View style={dynamicStyles.iconContainer}>
                <Ionicons
                  name={icon}
                  size={24}
                  color={
                    theme ? theme.colors.accent : modernColors.primary[500]
                  }
                />
              </View>
            )}
            <View style={styles.headerText}>
              {title && <Text style={dynamicStyles.title}>{title}</Text>}
              {subtitle && (
                <Text style={dynamicStyles.subtitle}>{subtitle}</Text>
              )}
            </View>
          </View>
        )}

        <View style={styles.body}>{children}</View>

        {footer && <View style={dynamicStyles.footer}>{footer}</View>}
      </View>
    );
  };

  // Render card based on variant
  const renderCard = () => {
    const cardStyle = [
      dynamicStyles.card,
      (dynamicStyles as any)[variant],
      style,
    ];

    // Use standard components on web to avoid Reanimated issues
    const isWeb = Platform.OS === "web";
    let Component: React.ComponentType<any> = isWeb ? View : AnimatedView;
    if (onPress) {
      Component = isWeb ? TouchableOpacity : AnimatedTouchableOpacity;
    }

    const props = {
      onPress,
      onLongPress,
      delayLongPress,
      onPressIn: handlePressIn,
      onPressOut: handlePressOut,
      style: isWeb ? cardStyle : [animatedStyle, cardStyle],
      testID,
      accessible: true,
      accessibilityRole: onPress ? ("button" as const) : ("none" as const),
      accessibilityLabel: accessibilityLabel || title,
      accessibilityHint,
    };

    if (variant === "gradient") {
      const colors =
        gradientColors ||
        (theme ? theme.gradients.surface : modernColors.gradients.surface);
      return (
        <Component {...props}>
          <LinearGradient
            colors={colors as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
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
                { backgroundColor: "rgba(255, 255, 255, 0.1)" },
              ]}
            >
              {renderContent()}
            </View>
          ) : Platform.OS === "ios" ? (
            <BlurView intensity={intensity} tint="light" style={styles.blur}>
              {renderContent()}
            </BlurView>
          ) : (
            <BlurView intensity={intensity} tint="dark" style={styles.blur}>
              {renderContent()}
            </BlurView>
          )}
        </Component>
      );
    }

    return <Component {...props}>{renderContent()}</Component>;
  };

  return renderCard();
};

const styles = StyleSheet.create({
  headerText: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  blur: {
    flex: 1,
  },
});

export default ModernCard;
