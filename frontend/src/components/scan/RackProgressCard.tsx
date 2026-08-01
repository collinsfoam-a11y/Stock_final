import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "@/hooks/useUiTokens";
import { AppTouchable } from "@/components/ui/AppTouchable";
import { borderRadius, spacing, typography } from "@/theme/unified";

interface RackProgressCardProps {
  rack: string;
  total: number;
  counted: number;
  percentage: number;
  isSelected?: boolean;
  onPress?: () => void;
}

export const RackProgressCard: React.FC<RackProgressCardProps> = ({
  rack,
  total,
  counted,
  percentage,
  isSelected,
  onPress,
}) => {
  const t = useUiTokens();

  // Determine progress color
  let progressColor = t.colors.accent;
  let statusIcon: keyof typeof Ionicons.glyphMap = "layers-outline";
  if (percentage >= 100) {
    progressColor = t.colors.success;
    statusIcon = "checkmark-done-circle-outline";
  } else if (percentage < 30) {
    progressColor = t.colors.warning;
    statusIcon = "time-outline";
  }

  const boundedPercentage = Math.min(100, Math.max(0, percentage));

  return (
    <Animated.View entering={FadeInDown.duration(250).springify()}>
      <AppTouchable
        style={[
          styles.container,
          {
            backgroundColor: t.colors.surface,
            borderColor: isSelected ? t.colors.accent : t.colors.border,
          },
          isSelected && { borderWidth: 2, backgroundColor: t.colors.surfaceElevated },
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Rack ${rack}, ${percentage}% completed`}
      >
        <View style={styles.header}>
          <View style={styles.rackTitleRow}>
            <Ionicons name={statusIcon} size={18} color={progressColor} />
            <Text style={[styles.rackName, { color: t.colors.textPrimary }]}>
              Rack {rack}
            </Text>
          </View>

          <View style={[styles.badge, { backgroundColor: `${progressColor}18` }]}>
            <Text style={[styles.percentage, { color: progressColor }]}>
              {boundedPercentage}%
            </Text>
          </View>
        </View>

        <View style={[styles.progressBarBg, { backgroundColor: t.colors.border }]}>
          <Animated.View
            style={[
              styles.progressBarFill,
              { width: `${boundedPercentage}%`, backgroundColor: progressColor },
            ]}
          />
        </View>

        <View style={styles.footer}>
          <Text style={[styles.stats, { color: t.colors.textSecondary }]}>
            {counted} / {total} items verified
          </Text>
        </View>
      </AppTouchable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  rackTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  rackName: {
    fontSize: typography.fontSize.md,
    fontWeight: "600",
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  percentage: {
    fontSize: typography.fontSize.xs,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: spacing.xs,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  stats: {
    fontSize: typography.fontSize.xs,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
});
