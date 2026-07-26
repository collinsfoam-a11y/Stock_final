import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import ModernCard from "@/components/ui/ModernCard";
import { borderRadius, colors, spacing, typography } from "@/theme/legacyCompat";

import { useUiTokens } from "@/hooks/useUiTokens";
interface ScanStats {
  pendingItems: number;
  scannedItems: number;
  verifiedItems: number;
}

interface ScanStatsCardProps {
  initialLoading: boolean;
  sessionStats: ScanStats;
}

function SkeletonLoader({ style }: { style?: object }) {
  return (
    <View style={[styles.skeleton, style]}>
      <Animated.View style={styles.skeletonShimmer} entering={FadeInDown.duration(300)} />
    </View>
  );
}

export function ScanStatsCard({ initialLoading, sessionStats }: ScanStatsCardProps) {
  const uiTokens = useUiTokens();
  const cardSurface = {
    backgroundColor: uiTokens.colors.surface,
    borderColor: uiTokens.colors.border,
  };
  const dividerSurface = { backgroundColor: uiTokens.colors.border };
  const skeletonSurface = { backgroundColor: uiTokens.colors.border };

  if (initialLoading) {
    return (
      <ModernCard elevation="none" padding={0} style={[styles.statsCard, cardSurface]}>
        <View style={styles.statsRow}>
          {[0, 1, 2].map((index) => (
            <React.Fragment key={index}>
              <View style={styles.statItem}>
                <SkeletonLoader
                  style={{
                    width: 48,
                    height: 32,
                    borderRadius: 8,
                    ...skeletonSurface,
                  }}
                />
                <SkeletonLoader
                  style={{
                    width: 60,
                    height: 12,
                    marginTop: 8,
                    borderRadius: 4,
                    ...skeletonSurface,
                  }}
                />
              </View>
              {index < 2 && <View style={[styles.statDivider, dividerSurface]} />}
            </React.Fragment>
          ))}
        </View>
      </ModernCard>
    );
  }

  return (
    <ModernCard elevation="none" padding={0} style={[styles.statsCard, cardSurface]}>
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: uiTokens.colors.textPrimary }]}>
            {sessionStats.scannedItems}
          </Text>
          <Text style={[styles.statLabel, { color: uiTokens.colors.textSecondary }]}>Scanned</Text>
        </View>
        <View style={[styles.statDivider, dividerSurface]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: uiTokens.colors.success }]}>
            {sessionStats.verifiedItems}
          </Text>
          <Text style={[styles.statLabel, { color: uiTokens.colors.textSecondary }]}>Verified</Text>
        </View>
        <View style={[styles.statDivider, dividerSurface]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: uiTokens.colors.warning }]}>
            {sessionStats.pendingItems}
          </Text>
          <Text style={[styles.statLabel, { color: uiTokens.colors.textSecondary }]}>Pending</Text>
        </View>
      </View>
    </ModernCard>
  );
}

const styles = StyleSheet.create({
  statsCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.gray[200],
  },
  statValue: {
    fontSize: typography.fontSize["3xl"],
    fontWeight: "700",
    color: colors.gray[900],
    marginBottom: 2,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[600],
    fontWeight: "600",
  },
  skeleton: {
    backgroundColor: colors.gray[200],
    overflow: "hidden",
  },
  skeletonShimmer: {
    flex: 1,
    backgroundColor: colors.gray[100],
  },
});
