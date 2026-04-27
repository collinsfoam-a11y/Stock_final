/**
 * ModernCard
 *
 * Theme-aware card container that preserves the existing API while using the
 * shared app theme and simpler utility-style surfaces.
 */

import React from "react";
import {
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useThemeContextSafe } from "../../context/ThemeContext";

const AnimatedTouchableOpacity =
  Animated.createAnimatedComponent(TouchableOpacity);

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

const DEFAULT_TITLE_STYLE = {
  fontSize: 18,
  fontWeight: "600" as const,
  lineHeight: 24,
};

const DEFAULT_SUBTITLE_STYLE = {
  fontSize: 14,
  fontWeight: "400" as const,
  lineHeight: 20,
};

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
  intensity = 18,
}) => {
  const themeContext = useThemeContextSafe();
  const theme = themeContext?.theme;
  const themeLegacy = themeContext?.themeLegacy;
  const isDark = themeContext?.isDark ?? false;

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const actualPadding = padding ?? theme?.spacing.md ?? themeLegacy?.spacing.md ?? 16;
  const accentColor = theme?.colors.accent ?? themeLegacy?.colors.accent ?? "#0969DA";
  const surfaceColor = theme?.colors.background.paper ?? themeLegacy?.colors.surface ?? "#FFFFFF";
  const elevatedSurface =
    theme?.colors.background.elevated ?? themeLegacy?.colors.surfaceElevated ?? surfaceColor;
  const glassSurface =
    theme?.colors.background.glass ?? themeLegacy?.colors.surfaceElevated ?? surfaceColor;
  const borderColor = theme?.colors.border.light ?? themeLegacy?.colors.border ?? "#D0D7DE";
  const strongBorder = theme?.colors.border.medium ?? borderColor;
  const primaryText = theme?.colors.text.primary ?? themeLegacy?.colors.text ?? "#0D1117";
  const secondaryText =
    theme?.colors.text.secondary ?? themeLegacy?.colors.textSecondary ?? "#57606A";

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!onPress) return;
    scale.value = withSpring(0.98, { damping: 18, stiffness: 320 });
    opacity.value = withTiming(0.94, { duration: 120 });
  };

  const handlePressOut = () => {
    if (!onPress) return;
    scale.value = withSpring(1, { damping: 18, stiffness: 320 });
    opacity.value = withTiming(1, { duration: 120 });
  };

  const dynamicStyles = React.useMemo(
    () => {
      const shadowMap = {
        none: undefined,
        sm: theme?.shadows.sm,
        md: theme?.shadows.md,
        lg: theme?.shadows.lg,
      } as const;

      return StyleSheet.create({
        card: {
          borderRadius: theme?.borderRadius.card ?? themeLegacy?.borderRadius.lg ?? 12,
          overflow: "hidden",
        },
        content: {
          padding: actualPadding,
          flex: 1,
        },
        default: {
          backgroundColor: surfaceColor,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor,
        },
        elevated: {
          backgroundColor: elevatedSurface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor,
          ...(shadowMap[elevation] ?? {}),
        },
        glass: {
          backgroundColor: glassSurface,
          borderWidth: 1,
          borderColor,
        },
        gradient: {
          backgroundColor: "transparent",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: strongBorder,
        },
        outlined: {
          backgroundColor: surfaceColor,
          borderWidth: 1,
          borderColor: strongBorder,
        },
        header: {
          flexDirection: "row",
          alignItems: "center",
          gap: theme?.spacing.sm ?? themeLegacy?.spacing.sm ?? 8,
          marginBottom: title || subtitle || icon ? theme?.spacing.md ?? themeLegacy?.spacing.md ?? 16 : 0,
        },
        footer: {
          marginTop: theme?.spacing.md ?? themeLegacy?.spacing.md ?? 16,
          paddingTop: theme?.spacing.md ?? themeLegacy?.spacing.md ?? 16,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: borderColor,
        },
        title: {
          ...(theme?.typography.h5 ?? DEFAULT_TITLE_STYLE),
          color: primaryText,
          fontFamily: theme?.typography.fontFamily.heading,
        },
        subtitle: {
          ...(theme?.typography.body.small ?? DEFAULT_SUBTITLE_STYLE),
          color: secondaryText,
          fontFamily: theme?.typography.fontFamily.body,
          marginTop: theme?.spacing.xs ?? themeLegacy?.spacing.xs ?? 4,
        },
      });
    },
    [
      actualPadding,
      borderColor,
      elevation,
      elevatedSurface,
      glassSurface,
      icon,
      primaryText,
      secondaryText,
      strongBorder,
      subtitle,
      surfaceColor,
      theme,
      themeLegacy,
      title,
    ],
  );

  const renderCardContent = () => (
    <View style={[dynamicStyles.content, contentStyle]}>
      {(title || subtitle || icon) && (
        <View style={dynamicStyles.header}>
          {icon ? <Ionicons name={icon} size={22} color={accentColor} /> : null}
          <View style={styles.headerText}>
            {title ? <Text style={dynamicStyles.title}>{title}</Text> : null}
            {subtitle ? <Text style={dynamicStyles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
      )}

      <View style={styles.body}>{children}</View>

      {footer ? <View style={dynamicStyles.footer}>{footer}</View> : null}
    </View>
  );

  const renderInner = () => {
    if (variant === "gradient") {
      const colors =
        gradientColors?.length && gradientColors.length >= 2
          ? ([gradientColors[0]!, gradientColors[1]!, ...gradientColors.slice(2)] as const)
          : ([...(theme?.gradients.surface ?? [surfaceColor, elevatedSurface])] as const);

      return (
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
        >
          {renderCardContent()}
        </LinearGradient>
      );
    }

    if (variant === "glass") {
      if (Platform.OS !== "web") {
        return (
          <BlurView intensity={intensity} tint={isDark ? "dark" : "light"} style={styles.fill}>
            {renderCardContent()}
          </BlurView>
        );
      }

      return <View style={styles.fill}>{renderCardContent()}</View>;
    }

    return renderCardContent();
  };

  const baseStyle: StyleProp<ViewStyle> = [
    dynamicStyles.card,
    dynamicStyles[variant],
    style,
  ];

  if (!onPress) {
    return (
      <View
        style={baseStyle}
        testID={testID}
        accessible={Boolean(accessibilityLabel || title)}
        accessibilityLabel={accessibilityLabel || title}
        accessibilityHint={accessibilityHint}
      >
        {renderInner()}
      </View>
    );
  }

  const isWeb = Platform.OS === "web";

  if (isWeb) {
    return (
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={delayLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.92}
        style={baseStyle}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        accessibilityHint={accessibilityHint}
      >
        {renderInner()}
      </TouchableOpacity>
    );
  }

  return (
    <AnimatedTouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      style={[animatedStyle, baseStyle]}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
    >
      {renderInner()}
    </AnimatedTouchableOpacity>
  );
};

const styles = StyleSheet.create({
  headerText: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
});

export default ModernCard;
