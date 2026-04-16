import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import ModernCard from "@/components/ui/ModernCard";
import {
  borderRadius,
  colors,
  shadows,
  spacing,
  typography,
} from "@/theme/modernDesign";

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
      <Animated.View
        style={styles.skeletonShimmer}
        entering={FadeInDown.duration(300)}
      />
    </View>
  );
}

export function ScanStatsCard({
  initialLoading,
  sessionStats,
}: ScanStatsCardProps) {
  if (initialLoading) {
    return (
      <ModernCard style={styles.statsCard}>
        <View style={styles.statsRow}>
          {[0, 1, 2].map((index) => (
            <React.Fragment key={index}>
              <View style={styles.statItem}>
                <SkeletonLoader
                  style={{ width: 48, height: 32, borderRadius: 8 }}
                />
                <SkeletonLoader
                  style={{
                    width: 60,
                    height: 12,
                    marginTop: 8,
                    borderRadius: 4,
                  }}
                />
              </View>
              {index < 2 && <View style={styles.statDivider} />}
            </React.Fragment>
          ))}
        </View>
      </ModernCard>
    );
  }

  return (
    <ModernCard style={styles.statsCard}>
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{sessionStats.scannedItems}</Text>
          <Text style={styles.statLabel}>Scanned</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.success[600] }]}>
            {sessionStats.verifiedItems}
          </Text>
          <Text style={styles.statLabel}>Verified</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.warning[600] }]}>
            {sessionStats.pendingItems}
          </Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>
    </ModernCard>
  );
}

const styles = StyleSheet.create({
  statsCard: {
    marginBottom: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    ...shadows.md,
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
    height: 40,
    backgroundColor: colors.gray[200],
  },
  statValue: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.gray[900],
    marginBottom: spacing.xs,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 1,
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
