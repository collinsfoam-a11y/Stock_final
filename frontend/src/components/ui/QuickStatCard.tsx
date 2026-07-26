/**
 * QuickStatCard Component - Modern statistics display
 * Features:
 * - Animated counter
 * - Gradient background option
 * - Icon with glow
 * - Trend indicator
 * - Multiple size variants
 */

import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  FadeInUp,
} from "react-native-reanimated";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import { font, gap, radius } from "@/theme/staffUiScale";

const AnimatedTouchableOpacity =
  Animated.createAnimatedComponent(TouchableOpacity);

type TrendDirection = "up" | "down" | "neutral";
type CardVariant = "default" | "gradient" | "outline";

interface QuickStatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  trend?: {
    direction: TrendDirection;
    value: string;
    label?: string;
  };
  variant?: CardVariant;
  gradientColors?: string[];
  onPress?: () => void;
  suffix?: string;
  prefix?: string;
  animate?: boolean;
  style?: ViewStyle;
  index?: number;
}

// Trend direction is conveyed by icon (trending-up/down/remove) and the value
// text in addition to color, so meaning is not color-only.
const buildTrendConfig = (
  tokens: ThemeTokens,
): Record<TrendDirection, { color: string; icon: keyof typeof Ionicons.glyphMap }> => ({
  up: { color: tokens.colors.success, icon: "trending-up" },
  down: { color: tokens.colors.error, icon: "trending-down" },
  neutral: { color: tokens.colors.textMuted, icon: "remove" },
});

export const QuickStatCard: React.FC<QuickStatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  iconColor,
  trend,
  variant = "default",
  gradientColors,
  onPress,
  suffix,
  prefix,
  animate = true,
  style,
  index = 0,
}) => {
  const tokens = useUiTokens();
  const styles = React.useMemo(() => createStyles(tokens), [tokens]);
  const trendConfig = React.useMemo(() => buildTrendConfig(tokens), [tokens]);
  // Explicit consumer override wins; default resolves to the semantic accent.
  const resolvedIconColor = iconColor ?? tokens.colors.accent;
  const scale = useSharedValue(1);
  const animatedValue = useSharedValue(0);
  const [displayValue, setDisplayValue] = React.useState(
    typeof value === "number" ? 0 : value,
  );

  // Animate counter
  useEffect(() => {
    if (animate && typeof value === "number") {
      animatedValue.value = withTiming(
        value,
        { duration: 1000 },
        (finished) => {
          if (finished) {
            runOnJS(setDisplayValue)(value);
          }
        },
      );

      // Update display value during animation
      const interval = setInterval(() => {
        const current = Math.round(animatedValue.value);
        setDisplayValue(current);
      }, 50);

      return () => clearInterval(interval);
    } else {
      setDisplayValue(value);
      return undefined;
    }
  }, [value, animate, animatedValue]);
  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const renderContent = () => (
    <View style={styles.content}>
      {/* Icon */}
      {icon && (
        <View
          style={[styles.iconContainer, { backgroundColor: colorWithAlpha(resolvedIconColor, 0.08) }]}
        >
          <Ionicons name={icon} size={24} color={resolvedIconColor} />
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsContainer}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.valueRow}>
          <Text style={styles.value}>
            {prefix}
            {typeof displayValue === "number"
              ? displayValue.toLocaleString()
              : displayValue}
            {suffix}
          </Text>
        </View>

        {/* Subtitle */}
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

        {/* Trend */}
        {trend && (
          <View
            style={[
              styles.trendContainer,
              { backgroundColor: colorWithAlpha(trendConfig[trend.direction].color, 0.08) },
            ]}
          >
            <Ionicons
              name={trendConfig[trend.direction].icon}
              size={12}
              color={trendConfig[trend.direction].color}
            />
            <Text
              style={[
                styles.trendValue,
                { color: trendConfig[trend.direction].color },
              ]}
            >
              {trend.value}
            </Text>
            {trend.label && (
              <Text style={styles.trendLabel}>{trend.label}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );

  const containerStyle = [
    styles.container,
    variant === "outline" && styles.outlineContainer,
    style,
  ];

  const card =
    variant === "gradient" ? (
      <LinearGradient
        colors={
          (gradientColors as [string, string, ...string[]]) ||
          ([tokens.colors.accentStrong, tokens.colors.accent] as [string, string])
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.container, styles.gradientContainer, style]}
      >
        {renderContent()}
      </LinearGradient>
    ) : (
      <View style={containerStyle}>{renderContent()}</View>
    );

  if (onPress) {
    return (
      <Animated.View
        entering={FadeInUp.delay(index * 75).springify()}
      >
        <AnimatedTouchableOpacity
          style={animatedStyle}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={1}
        >
          {card}
        </AnimatedTouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInUp.delay(index * 75).springify()}>
      {card}
    </Animated.View>
  );
};

const createStyles = (tokens: ThemeTokens) => StyleSheet.create({
  container: {
    backgroundColor: tokens.colors.surface,
    borderRadius: radius.lg,
    padding: gap.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  gradientContainer: {
    borderWidth: 0,
  },
  outlineContainer: {
    backgroundColor: "transparent",
    borderColor: colorWithAlpha(tokens.colors.accent, 0.3),
    borderWidth: 1.5,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: gap.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  statsContainer: {
    flex: 1,
    gap: gap.xs,
  },
  title: {
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    color: tokens.colors.textSecondary,
  },
  subtitle: {
    fontSize: font.size.label,
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: gap.xs,
  },
  value: {
    fontSize: font.size.xl,
    fontWeight: font.weight.bold,
    color: tokens.colors.textPrimary,
  },
  trendContainer: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: gap.xs,
    paddingHorizontal: gap.sm,
    paddingVertical: gap.xs,
    borderRadius: radius.full,
    marginTop: 4,
  },
trendValue: {
    fontSize: font.size.caption,
    fontWeight: "600",
  },
  trendLabel: {
    fontSize: font.size.sm,
    color: tokens.colors.textMuted,
  },
});

export default QuickStatCard;
