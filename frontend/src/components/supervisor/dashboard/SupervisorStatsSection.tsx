import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { GlassCard, ProgressRing, StatsCard } from "@/components/ui";
import { theme } from "@/styles/modernDesignSystem";
import { DashboardStats } from "@/components/supervisor/dashboard/supervisorDashboardShared";

interface SupervisorStatsSectionProps {
  completionPercentage: number;
  onStatPress: (statType: "total" | "open" | "items" | "risk") => void;
  stats: DashboardStats;
}

export function SupervisorStatsSection({
  completionPercentage,
  onStatPress,
  stats,
}: SupervisorStatsSectionProps) {
  return (
    <>
      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <StatsCard
            title="Total Sessions"
            value={stats.totalSessions}
            icon="folder-open"
            variant="primary"
            onPress={() => onStatPress("total")}
            style={styles.statCard}
            delay={100}
            animated
          />
          <StatsCard
            title="Open Sessions"
            value={stats.openSessions}
            icon="time"
            variant="warning"
            onPress={() => onStatPress("open")}
            style={styles.statCard}
            delay={150}
            animated
          />
        </View>

        <View style={styles.statsRow}>
          <StatsCard
            title="Items Counted"
            value={stats.totalItems}
            icon="cube"
            variant="info"
            onPress={() => onStatPress("items")}
            style={styles.statCard}
            delay={200}
            animated
          />
          <StatsCard
            title="High Risk"
            value={stats.highRiskSessions}
            icon="warning"
            variant="error"
            subtitle="Sessions"
            onPress={() => onStatPress("risk")}
            style={styles.statCard}
            delay={250}
            animated
          />
        </View>
      </View>

      <Animated.View entering={FadeInDown.delay(300).springify()}>
        <GlassCard
          variant="medium"
          intensity={25}
          borderRadius={theme.borderRadius.xl}
          padding={theme.spacing.lg}
          withGradientBorder={true}
          elevation="lg"
          style={styles.progressCard}
        >
          <View style={styles.progressContent}>
            <View style={styles.progressInfo}>
              <Text style={styles.progressTitle}>Session Completion</Text>
              <Text style={styles.progressSubtitle}>
                {stats.closedSessions + stats.reconciledSessions} of{" "}
                {stats.totalSessions} completed
              </Text>
            </View>
            <ProgressRing
              progress={completionPercentage}
              size={100}
              strokeWidth={10}
              colors={[
                theme.colors.success.main,
                theme.colors.success.main + "CC",
              ]}
            />
          </View>
        </GlassCard>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  statsRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  statCard: {
    flex: 1,
  },
  progressCard: {
    marginBottom: theme.spacing.xl,
  },
  progressContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  progressTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: theme.colors.text.primary,
  },
  progressSubtitle: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
});
