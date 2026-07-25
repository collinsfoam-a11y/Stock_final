import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import { font, gap, radius } from "@/theme/staffUiScale";

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
  const tokens = useUiTokens();
  const styles = React.useMemo(() => createStyles(tokens), [tokens]);
  // Progress is also conveyed by the % value and "counted / total" text, so
  // color is a secondary signal only.
  let progressColor = tokens.colors.accent;
  if (percentage >= 100) progressColor = tokens.colors.success;
  else if (percentage < 30) progressColor = tokens.colors.warning;

  return (
    <View
      style={[styles.container, isSelected && styles.selectedContainer]}
      onTouchEnd={onPress}
    >
      <View style={styles.header}>
        <Text style={[styles.rackName, isSelected && styles.selectedText]}>
          Rack {rack}
        </Text>
        <Text
          style={[
            styles.percentage,
            { color: progressColor },
            isSelected && styles.selectedText,
          ]}
        >
          {percentage}%
        </Text>
      </View>

      <View style={styles.progressBarBg}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${percentage}%`, backgroundColor: progressColor },
          ]}
        />
      </View>

      <Text style={[styles.stats, isSelected && styles.selectedText]}>
        {counted} / {total} items verified
      </Text>
    </View>
  );
};

const createStyles = (tokens: ThemeTokens) => StyleSheet.create({
  container: {
    backgroundColor: tokens.colors.surface,
    borderRadius: radius.md,
    padding: gap.md,
    marginBottom: gap.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  selectedContainer: {
    borderColor: tokens.colors.accent,
    backgroundColor: tokens.colors.surfaceElevated,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: gap.sm,
  },
  rackName: {
    fontSize: font.size.lg,
    fontWeight: font.weight.semibold,
    color: tokens.colors.textPrimary,
  },
  percentage: {
    fontSize: font.size.base,
    fontWeight: font.weight.bold,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colorWithAlpha(tokens.colors.textMuted, 0.18),
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: gap.xs,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  stats: {
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    color: tokens.colors.textSecondary,
    textAlign: "right",
  },
  selectedText: {
  },
});
