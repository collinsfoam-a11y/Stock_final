/**
 * Skeleton Component - Loading placeholder
 * Enhanced with shimmer gradient animation inspired by react-native-auto-skeleton
 * Safe, non-breaking addition for loading states
 */

import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Platform, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { legacyColors as modernColors } from "../../theme/unified";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
  variant?: "text" | "circular" | "rectangular";
  shimmer?: boolean;
  accessible?: boolean;
  accessibilityLabel?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = 20,
  borderRadius = 4,
  style,
  variant = "rectangular",
  shimmer = true,
  accessible = true,
  accessibilityLabel = "Loading...",
}) => {
  const translateX = useRef(new Animated.Value(-1)).current;
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (shimmer) {
      // Shimmer animation - sweeping highlight
      const shimmerAnimation = Animated.loop(
        Animated.timing(translateX, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: Platform.OS !== "web",
        }),
      );
      shimmerAnimation.start();
      return () => shimmerAnimation.stop();
    } else {
      // Fallback pulse animation
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.7,
            duration: 800,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(opacity, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: Platform.OS !== "web",
          }),
        ]),
      );
      pulseAnimation.start();
      return () => pulseAnimation.stop();
    }
  }, [translateX, opacity, shimmer]);

  const getVariantStyle = (): ViewStyle => {
    switch (variant) {
      case "circular":
        return {
          width: height,
          height,
          borderRadius: height / 2,
        };
      case "text":
        return {
          height,
          borderRadius: borderRadius || 4,
        };
      default:
        return {
          height,
          borderRadius,
        };
    }
  };

  const variantStyle = getVariantStyle();

  if (shimmer) {
    return (
      <View
        accessible={accessible}
        accessibilityRole={accessible ? "progressbar" : undefined}
        accessibilityLabel={accessible ? accessibilityLabel : undefined}
        style={[
          styles.skeleton,
          {
            width,
            height: variantStyle.height,
            borderRadius: variantStyle.borderRadius,
            backgroundColor: modernColors.neutral[200],
          } as ViewStyle,
          style as ViewStyle,
        ]}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              transform: [
                {
                  translateX: translateX.interpolate({
                    inputRange: [-1, 1],
                    outputRange: [-200, 200],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={["transparent", "rgba(255, 255, 255, 0.4)", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      </View>
    );
  }

  return (
    <Animated.View
      accessible={accessible}
      accessibilityRole={accessible ? "progressbar" : undefined}
      accessibilityLabel={accessible ? accessibilityLabel : undefined}
      style={[
        styles.skeleton,
        {
          width,
          height: variantStyle.height,
          borderRadius: variantStyle.borderRadius,
          backgroundColor: modernColors.neutral[200],
          opacity,
        } as ViewStyle,
        style as ViewStyle,
      ]}
    />
  );
};

interface SkeletonTextProps {
  lines?: number;
  lineHeight?: number;
  lastLineWidth?: string | number;
  accessible?: boolean;
  accessibilityLabel?: string;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  lineHeight = 16,
  lastLineWidth = "60%",
  accessible = true,
  accessibilityLabel = "Loading text...",
}) => {
  return (
    <View
      accessible={accessible}
      accessibilityRole={accessible ? "progressbar" : undefined}
      accessibilityLabel={accessible ? accessibilityLabel : undefined}
    >
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={lineHeight}
          width={index === lines - 1 ? lastLineWidth : "100%"}
          style={{ marginBottom: 8 }}
          variant="text"
          accessible={false}
        />
      ))}
    </View>
  );
};

// Card skeleton for common card loading states
export const SkeletonCard: React.FC<{
  style?: ViewStyle;
  accessible?: boolean;
  accessibilityLabel?: string;
}> = ({
  style,
  accessible = true,
  accessibilityLabel = "Loading card...",
}) => {
  return (
    <View
      accessible={accessible}
      accessibilityRole={accessible ? "progressbar" : undefined}
      accessibilityLabel={accessible ? accessibilityLabel : undefined}
      style={[styles.card, style]}
    >
      <View style={styles.cardHeader}>
        <Skeleton width={48} height={48} variant="circular" accessible={false} />
        <View style={styles.cardHeaderText}>
          <Skeleton width="70%" height={16} style={{ marginBottom: 8 }} accessible={false} />
          <Skeleton width="40%" height={12} accessible={false} />
        </View>
      </View>
      <SkeletonText lines={2} lineHeight={14} lastLineWidth="80%" accessible={false} />
    </View>
  );
};

// List item skeleton
export const SkeletonListItem: React.FC<{
  style?: ViewStyle;
  accessible?: boolean;
  accessibilityLabel?: string;
}> = ({
  style,
  accessible = true,
  accessibilityLabel = "Loading list item...",
}) => {
  return (
    <View
      accessible={accessible}
      accessibilityRole={accessible ? "progressbar" : undefined}
      accessibilityLabel={accessible ? accessibilityLabel : undefined}
      style={[styles.listItem, style]}
    >
      <Skeleton width={40} height={40} borderRadius={8} accessible={false} />
      <View style={styles.listItemContent}>
        <Skeleton width="60%" height={14} style={{ marginBottom: 6 }} accessible={false} />
        <Skeleton width="40%" height={12} accessible={false} />
      </View>
      <Skeleton width={60} height={24} borderRadius={12} accessible={false} />
    </View>
  );
};

const styles = StyleSheet.create({
  skeleton: {
    overflow: "hidden",
  },
  card: {
    padding: 16,
    backgroundColor: modernColors.background.paper,
    borderRadius: 12,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: modernColors.background.paper,
    borderRadius: 8,
    marginBottom: 8,
  },
  listItemContent: {
    flex: 1,
    marginLeft: 12,
  },
});
