import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import ModernCard from "@/components/ui/ModernCard";
import {
  borderRadius,
  colors,
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
  const readyToFinish =
    sessionStats.scannedItems > 0 && sessionStats.pendingItems === 0;

  if (initialLoading) {
    return (
      <ModernCard variant="outlined" elevation="none" style={styles.statsCard}>
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
    <ModernCard variant="outlined" elevation="none" style={styles.statsCard}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardEyebrow}>Rack Progress</Text>
          <Text style={styles.cardTitle}>
            Keep the rack clean before submitting it for review
          </Text>
        </View>

        <View
          style={[
            styles.statusChip,
            readyToFinish ? styles.statusChipReady : styles.statusChipPending,
          ]}
        >
          <Ionicons
            name={readyToFinish ? "checkmark-circle" : "time-outline"}
            size={14}
            color={readyToFinish ? colors.success[600] : colors.warning[600]}
          />
          <Text
            style={[
              styles.statusChipText,
              readyToFinish
                ? styles.statusChipTextReady
                : styles.statusChipTextPending,
            ]}
          >
            {readyToFinish ? "Ready" : `${sessionStats.pendingItems} pending`}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statTile}>
          <Text style={styles.statValue}>{sessionStats.scannedItems}</Text>
          <Text style={styles.statLabel}>Scanned</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={[styles.statValue, { color: colors.success[600] }]}>
            {sessionStats.verifiedItems}
          </Text>
          <Text style={styles.statLabel}>Verified</Text>
        </View>
        <View style={styles.statTile}>
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
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  cardEyebrow: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[700],
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  cardTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
    lineHeight: 22,
    maxWidth: 220,
  },
  statusChip: {
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  statusChipReady: {
    backgroundColor: colors.success[50],
  },
  statusChipPending: {
    backgroundColor: colors.warning[50],
  },
  statusChipText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  statusChipTextReady: {
    color: colors.success[600],
  },
  statusChipTextPending: {
    color: colors.warning[600],
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statTile: {
    flex: 1,
    minHeight: 96,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray[50],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    justifyContent: "space-between",
  },
  statValue: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.gray[900],
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.gray[600],
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
