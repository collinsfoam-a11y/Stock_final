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

const SURFACE_CARD = "#ffffff";
const SURFACE_BORDER = "#d9e5e2";
const SURFACE_MUTED = "#f8fafc";
const ACCENT = "#0f766e";
const TEXT_STRONG = "#0f172a";
const TEXT_MUTED = "#475569";

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
      <ModernCard style={styles.statsCard} contentStyle={styles.statsContent}>
        <View style={styles.statsRow}>
          {[0, 1, 2].map((index) => (
            <View key={index} style={styles.statTile}>
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
          ))}
        </View>
      </ModernCard>
    );
  }

  return (
    <ModernCard style={styles.statsCard} contentStyle={styles.statsContent}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.kicker}>Live progress</Text>
          <Text style={styles.heading}>Current rack totals</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>Live</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statTile}>
          <Text style={styles.statValue}>{sessionStats.scannedItems}</Text>
          <Text style={styles.statLabel}>Scanned</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={[styles.statValue, styles.verifiedValue]}>
            {sessionStats.verifiedItems}
          </Text>
          <Text style={styles.statLabel}>Verified</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={[styles.statValue, styles.pendingValue]}>
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
    backgroundColor: SURFACE_CARD,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    ...shadows.md,
  },
  statsContent: {
    padding: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  kicker: {
    fontSize: typography.fontSize.xs,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: ACCENT,
    marginBottom: spacing.xs,
  },
  heading: {
    fontSize: typography.fontSize.lg,
    fontWeight: "700",
    color: TEXT_STRONG,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: "#ecf7f4",
    borderWidth: 1,
    borderColor: "#cae8df",
  },
  statusBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: "700",
    color: ACCENT,
    letterSpacing: 0.8,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  statTile: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: 18,
    backgroundColor: SURFACE_MUTED,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  statValue: {
    fontSize: 32,
    fontWeight: "800",
    color: TEXT_STRONG,
    marginBottom: spacing.xs,
    fontVariant: ["tabular-nums"],
  },
  verifiedValue: {
    color: ACCENT,
  },
  pendingValue: {
    color: colors.warning[600],
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: TEXT_MUTED,
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
