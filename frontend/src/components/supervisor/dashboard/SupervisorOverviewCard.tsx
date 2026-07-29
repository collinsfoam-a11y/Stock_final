import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useUiTokens } from "@/hooks/useUiTokens";
import { theme } from "@/styles/unifiedSystem";
import { colors as unifiedColors, semanticColors } from "@/theme/unified";
import { colorWithAlpha } from "@/theme/themeTokens";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { ModernCard } from "@/components/ui/ModernCard";
import { LiveIndicator } from "@/components/ui/LiveIndicator";

export interface OverviewAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  primary: boolean;
}

interface SupervisorOverviewCardProps {
  completionPercentage: number;
  highRiskSessions: number;
  openSessions: number;
  overviewActions: OverviewAction[];
}

export function SupervisorOverviewCard({
  completionPercentage,
  highRiskSessions,
  openSessions,
  overviewActions,
}: SupervisorOverviewCardProps) {
  const uiTokens = useUiTokens();
  const { width } = useWindowDimensions();
  const isCompact = width < 640;

  return (
    <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.section}>
      <ModernCard
        variant="outlined"
        elevation="none"
        padding={uiTokens.spacing.lg}
        style={styles.overviewCard}
      >
        <View style={[styles.topRow, isCompact && styles.topRowCompact]}>
          {isCompact ? (
            <View style={styles.indicator}>
              <LiveIndicator label="Real-time monitoring" size="small" />
            </View>
          ) : null}
          <View style={styles.copy}>
            <Text style={[styles.eyebrow, { color: uiTokens.colors.accentStrong }]}>
              Supervisor overview
            </Text>
            <Text
              style={[
                styles.title,
                isCompact && styles.titleCompact,
                { color: uiTokens.colors.textPrimary },
              ]}
            >
              Keep counting on track and fix issues early.
            </Text>
            <Text style={[styles.subtitle, { color: uiTokens.colors.textSecondary }]}>
              Track progress, check team activity, and resolve count differences from one place.
            </Text>
          </View>
          {!isCompact ? (
            <View style={styles.indicator}>
              <LiveIndicator label="Real-time monitoring" size="small" />
            </View>
          ) : null}
        </View>

        <View style={styles.metrics}>
          <View style={styles.metricCard}>
            <Text style={[styles.metricValue, { color: uiTokens.colors.textPrimary }]}>
              {openSessions}
            </Text>
            <Text style={[styles.metricLabel, { color: uiTokens.colors.textSecondary }]}>
              Open sessions
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={[styles.metricValue, { color: uiTokens.colors.textPrimary }]}>
              {highRiskSessions}
            </Text>
            <Text style={[styles.metricLabel, { color: uiTokens.colors.textSecondary }]}>
              High risk
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={[styles.metricValue, { color: uiTokens.colors.textPrimary }]}>
              {Math.round(completionPercentage)}%
            </Text>
            <Text style={[styles.metricLabel, { color: uiTokens.colors.textSecondary }]}>
              Completion
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          {overviewActions.map((action) => (
            <AnimatedPressable
              key={action.key}
              onPress={action.onPress}
              hapticFeedback="light"
              style={[
                styles.actionButton,
                {
                  backgroundColor: action.primary
                    ? uiTokens.colors.accentStrong
                    : uiTokens.colors.surface,
                  borderColor: action.primary
                    ? uiTokens.colors.accentStrong
                    : uiTokens.colors.border,
                },
              ]}
            >
              <Ionicons
                name={action.icon}
                size={18}
                color={action.primary ? semanticColors.text.inverse : uiTokens.colors.textPrimary}
              />
              <Text
                style={[
                  styles.actionLabel,
                  {
                    color: action.primary
                      ? semanticColors.text.inverse
                      : uiTokens.colors.textPrimary,
                  },
                ]}
              >
                {action.label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      </ModernCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: theme.spacing.xl,
  },
  overviewCard: {
    borderRadius: theme.borderRadius.xl,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  topRowCompact: {
    flexDirection: "column",
  },
  copy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  indicator: {
    alignSelf: "flex-start",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34,
  },
  titleCompact: {
    fontSize: 24,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  metricCard: {
    minWidth: 120,
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: colorWithAlpha(unifiedColors.primary[500], 0.06),
    borderWidth: 1,
    borderColor: colorWithAlpha(unifiedColors.primary[500], 0.12),
    gap: theme.spacing.xs,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: "700",
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  actionButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
});
