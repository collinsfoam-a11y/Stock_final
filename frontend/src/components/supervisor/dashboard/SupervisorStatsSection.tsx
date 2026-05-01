import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { OperationalCard, StatsCard } from "@/components/ui";
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
        <OperationalCard
          variant="light"
          borderRadius={theme.borderRadius.xl}
          padding={theme.spacing.lg}
          elevation="sm"
          style={styles.progressCard}
        >
          <View style={styles.progressContent}>
            <View style={styles.progressInfo}>
              <Text style={styles.progressTitle}>Session Completion</Text>
              <Text style={styles.progressSubtitle}>
                {stats.closedSessions + stats.reconciledSessions} of {stats.totalSessions} completed
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.max(0, Math.min(completionPercentage, 100))}%` },
                  ]}
                />
              </View>
            </View>
            <Text style={styles.progressPercent}>{Math.round(completionPercentage)}%</Text>
          </View>
        </OperationalCard>
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
    gap: theme.spacing.md,
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
  progressTrack: {
    marginTop: theme.spacing.sm,
    height: 10,
    borderRadius: theme.borderRadius.full,
    backgroundColor: "#e2e8f0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.success.main,
  },
  progressPercent: {
    minWidth: 64,
    textAlign: "right",
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
});
