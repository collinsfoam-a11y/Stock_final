/**
 * ActivityFeedItem Component
 *
 * Tokenized operational activity row with reduced-motion-aware entrance feedback.
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInRight } from "react-native-reanimated";
import { AnimatedPressable } from "./AnimatedPressable";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getOperationalMotionDuration } from "@/utils/motion";

export type ActivityType = "scan" | "session" | "variance" | "user" | "system";

interface ActivityFeedItemProps {
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string | Date;
  onPress?: () => void;
  delay?: number;
  status?: "success" | "warning" | "error" | "info";
}

const activityIcons = {
  scan: {
    icon: "scan" as const,
  },
  session: {
    icon: "folder-open" as const,
  },
  variance: {
    icon: "analytics" as const,
  },
  user: {
    icon: "person" as const,
  },
  system: {
    icon: "settings" as const,
  },
};

const formatTimestamp = (ts: string | Date) => {
  const date = typeof ts === "string" ? new Date(ts) : ts;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

export const ActivityFeedItem: React.FC<ActivityFeedItemProps> = ({
  type,
  title,
  description,
  timestamp,
  onPress,
  delay = 0,
  status,
}) => {
  const uiTokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const motionDuration = getOperationalMotionDuration(uiTokens, "normal", prefersReducedMotion);
  const config = activityIcons[type];
  const typeColor = {
    scan: uiTokens.colors.accent,
    session: uiTokens.colors.info,
    variance: uiTokens.colors.warning,
    user: uiTokens.colors.success,
    system: uiTokens.colors.textSecondary,
  }[type];
  const statusColor = status
    ? {
        success: uiTokens.colors.success,
        warning: uiTokens.colors.warning,
        error: uiTokens.colors.error,
        info: uiTokens.colors.info,
      }[status]
    : null;
  const accessibilityLabel = [
    title,
    description,
    status ? `Status ${status}` : null,
    formatTimestamp(timestamp),
  ]
    .filter(Boolean)
    .join(". ");
  const enteringAnimation =
    motionDuration === 0
      ? undefined
      : FadeInRight.delay(Math.min(delay, motionDuration)).duration(motionDuration);

  const content = (
    <Animated.View
      entering={enteringAnimation}
      style={styles.container}
      accessible={!onPress}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.content}>
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: colorWithAlpha(typeColor, 0.12),
              borderColor: colorWithAlpha(typeColor, 0.24),
            },
          ]}
        >
          <Ionicons name={config.icon} size={20} color={typeColor} />
        </View>

        <View style={styles.textContent}>
          <View style={styles.header}>
            <Text
              style={[
                styles.title,
                {
                  color: uiTokens.colors.textPrimary,
                },
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {status && (
              <View
                style={[styles.statusDot, { backgroundColor: statusColor ?? uiTokens.colors.info }]}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            )}
          </View>

          <Text
            style={[
              styles.description,
              {
                color: uiTokens.colors.textSecondary,
              },
            ]}
            numberOfLines={2}
          >
            {description}
          </Text>

          <Text
            style={[
              styles.timestamp,
              {
                color: uiTokens.colors.textMuted,
              },
            ]}
          >
            {formatTimestamp(timestamp)}
          </Text>
        </View>

        {onPress && (
          <Ionicons name="chevron-forward" size={20} color={uiTokens.colors.textMuted} />
        )}
      </View>

      <View style={styles.divider} />
    </Animated.View>
  );

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        hapticFeedback="light"
        accessibilityLabel={accessibilityLabel}
      >
        {content}
      </AnimatedPressable>
    );
  }

  return content;
};

type ActivityFeedTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: ActivityFeedTokens) =>
  StyleSheet.create({
    container: {
      marginBottom: uiTokens.spacing.sm,
    },
    content: {
      flexDirection: "row",
      alignItems: "center",
      gap: uiTokens.spacing.md,
      paddingVertical: uiTokens.spacing.md,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: uiTokens.radius.md,
      borderWidth: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    textContent: {
      flex: 1,
      gap: uiTokens.spacing.xs,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: uiTokens.spacing.sm,
    },
    title: {
      flex: 1,
      fontSize: 16,
      fontWeight: "600",
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: uiTokens.radius.full,
    },
    description: {
      fontSize: 14,
      lineHeight: 18,
    },
    timestamp: {
      marginTop: uiTokens.spacing.xs,
      fontSize: 12,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: uiTokens.colors.border,
      marginLeft: uiTokens.spacing.xxl,
    },
  });
