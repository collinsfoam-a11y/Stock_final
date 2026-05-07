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
  borderRadius,
  duration,
  shadows,
  semanticColors,
  spacing,
  springConfigs,
  textStyles,
} from "../../theme/unified";
import { useThemeContextSafe } from "../../context/ThemeContext";
import { haptics } from "../../services/haptics";

const AnimatedTouchableOpacity =
  Animated.createAnimatedComponent(TouchableOpacity);
const AnimatedView = Animated.createAnimatedComponent(View);

/**
 * Supported visual treatments for the reusable card container.
 */
export type CardVariant =
  | "default"
  | "elevated"
  | "glass"
  | "gradient"
  | "outlined";

/**
 * Available shadow intensities for non-glass card variants.
 */
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

/**
 * Renders a themed card wrapper with optional press, blur, and gradient states.
 */
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
        : spacing.md;
  const activeRadius = theme?.borderRadius?.md ?? borderRadius.md;

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
    if (onPress || onLongPress) {
      scale.value = withSpring(0.98, springConfigs.gentle);
      opacity.value = withTiming(0.9, {
        duration: duration.fast,
      });
    }
  };

  const handlePressOut = () => {
    if (onPress || onLongPress) {
      scale.value = withSpring(1, springConfigs.gentle);
      opacity.value = withTiming(1, {
        duration: duration.fast,
      });
    }
  };

  const handlePress = () => {
    if (onPress) {
      void haptics.light();
      onPress();
    }
  };

  const handleLongPress = () => {
    if (onLongPress) {
      void haptics.medium();
      onLongPress();
    }
  };

  // Memoized dynamic styles aligned with DESIGN.md
  const dynamicStyles = React.useMemo(() => {
    const shadowMap = shadows;

    return StyleSheet.create({
      card: {
        borderRadius: activeRadius,
        overflow: "hidden",
      },
      content: {
        padding: actualPadding,
        flex: 1,
      },
      default: {
        backgroundColor: semanticColors.card.background,
        borderWidth: 1,
        borderColor: semanticColors.card.border,
        ...shadowMap[elevation],
      },
      elevated: {
        backgroundColor: semanticColors.card.background,
        ...shadowMap[elevation],
      },
      glass: {
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.15)",
      },
      gradient: {
        backgroundColor: "transparent",
      },
      outlined: {
        backgroundColor: semanticColors.card.background,
        borderWidth: 1,
        borderColor: semanticColors.card.border,
      },
      title: {
        ...textStyles.h5,
        color: semanticColors.text.primary,
        marginBottom: spacing.xs,
      },
      subtitle: {
        ...textStyles.bodySmall,
        color: semanticColors.text.secondary,
      },
      footer: {
        marginTop: spacing.md,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: semanticColors.card.border,
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
  }, [activeRadius, actualPadding, elevation]);

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
                  color={semanticColors.interactive.default}
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
    const isInteractive = Boolean(onPress || onLongPress);
    let Component: React.ComponentType<any> = isWeb ? View : AnimatedView;

    if (isInteractive) {
      Component = isWeb ? TouchableOpacity : AnimatedTouchableOpacity;
    }

    const props = {
      onPress: handlePress,
      onLongPress: handleLongPress,
      delayLongPress,
      onPressIn: handlePressIn,
      onPressOut: handlePressOut,
      style: isWeb ? cardStyle : [animatedStyle, cardStyle],
      testID,
      accessible: true,
      accessibilityRole: isInteractive ? ("button" as const) : ("none" as const),
      accessibilityLabel: accessibilityLabel || title,
      accessibilityHint,
    };

    if (variant === "gradient") {
      const gradientPalette =
        gradientColors ||
        (theme
          ? theme.gradients.surface
          : ([semanticColors.background.paper, semanticColors.background.secondary] as const));
      return (
        <Component {...props}>
          <LinearGradient
            colors={
              gradientPalette as unknown as readonly [
                string,
                string,
                ...string[],
              ]
            }
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
