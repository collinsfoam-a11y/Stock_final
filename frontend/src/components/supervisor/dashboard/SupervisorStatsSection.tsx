import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useUiTokens } from "@/hooks/useUiTokens";
import { theme } from "@/styles/unifiedSystem";
import { colorWithAlpha } from "@/theme/themeTokens";
import { DashboardStats } from "@/components/supervisor/dashboard/supervisorDashboardShared";
import { ModernCard } from "@/components/ui/ModernCard";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { StatsCard } from "@/components/ui/StatsCard";

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
  const uiTokens = useUiTokens();

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
        <ModernCard
          variant="outlined"
          elevation="none"
          intensity={25}
          padding={uiTokens.spacing.lg}
          style={styles.progressCard}
        >
          <View style={styles.progressContent}>
            <View style={styles.progressInfo}>
              <Text style={[styles.progressTitle, { color: uiTokens.colors.textPrimary }]}>
                Session Completion
              </Text>
              <Text style={[styles.progressSubtitle, { color: uiTokens.colors.textSecondary }]}>
                {stats.closedSessions + stats.reconciledSessions} of {stats.totalSessions} completed
              </Text>
            </View>
            <ProgressRing
              progress={completionPercentage}
              size={100}
              strokeWidth={10}
              colors={[uiTokens.colors.success, colorWithAlpha(uiTokens.colors.success, 0.72)]}
            />
          </View>
        </ModernCard>
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
  },
  progressSubtitle: {
    fontSize: 14,
  },
});
