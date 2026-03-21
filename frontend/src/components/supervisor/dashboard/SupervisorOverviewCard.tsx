import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { AnimatedPressable, GlassCard, LiveIndicator } from "@/components/ui";
import { theme } from "@/styles/modernDesignSystem";
import { colors as unifiedColors } from "@/theme/unified";

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
  return (
    <Animated.View
      entering={FadeInDown.delay(0).springify()}
      style={styles.section}
    >
      <GlassCard
        variant="medium"
        intensity={24}
        borderRadius={theme.borderRadius.xl}
        padding={theme.spacing.lg}
        withGradientBorder={true}
        elevation="lg"
      >
        <View style={styles.topRow}>
          <View style={styles.copy}>
            <Text style={styles.eyebrow}>Supervisor overview</Text>
            <Text style={styles.title}>
              Keep counting on track and fix issues early.
            </Text>
            <Text style={styles.subtitle}>
              Track progress, check team activity, and resolve count differences
              from one place.
            </Text>
          </View>
          <View style={styles.indicator}>
            <LiveIndicator label="Real-time monitoring" size="small" />
          </View>
        </View>

        <View style={styles.metrics}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{openSessions}</Text>
            <Text style={styles.metricLabel}>Open sessions</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{highRiskSessions}</Text>
            <Text style={styles.metricLabel}>High risk</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>
              {Math.round(completionPercentage)}%
            </Text>
            <Text style={styles.metricLabel}>Completion</Text>
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
                action.primary && styles.actionButtonPrimary,
              ]}
            >
              <Ionicons
                name={action.icon}
                size={18}
                color={
                  action.primary
                    ? unifiedColors.white
                    : theme.colors.text.primary
                }
              />
              <Text
                style={[
                  styles.actionLabel,
                  action.primary && styles.actionLabelPrimary,
                ]}
              >
                {action.label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: theme.spacing.xl,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  copy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  indicator: {
    alignSelf: "flex-start",
  },
  eyebrow: {
    color: theme.colors.primary[300],
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    color: theme.colors.text.primary,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34,
  },
  subtitle: {
    color: theme.colors.text.secondary,
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
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    gap: theme.spacing.xs,
  },
  metricValue: {
    color: theme.colors.text.primary,
    fontSize: 26,
    fontWeight: "700",
  },
  metricLabel: {
    color: theme.colors.text.secondary,
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
    borderColor: "rgba(255, 255, 255, 0.16)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  actionButtonPrimary: {
    backgroundColor: theme.colors.primary[500],
    borderColor: theme.colors.primary[400],
  },
  actionLabel: {
    color: theme.colors.text.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  actionLabelPrimary: {
    color: unifiedColors.white,
  },
});
