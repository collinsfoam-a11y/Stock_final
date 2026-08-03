import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";

import { ModernCard } from "@/components/ui/ModernCard";
import { borderRadius, spacing, typography } from "@/theme/unified";
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
      <ModernCard elevation="sm" padding={0} style={[styles.statsCard, cardSurface]}>
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
    <ModernCard elevation="sm" padding={0} style={[styles.statsCard, cardSurface]}>
      <Animated.View style={styles.statsRow} entering={FadeInDown.duration(350).springify()}>
        <Animated.View style={styles.statItem} entering={FadeInDown.delay(50).duration(300)}>
          <View style={styles.statHeader}>
            <Ionicons name="barcode-outline" size={14} color={uiTokens.colors.accent} />
            <Text style={[styles.statLabel, { color: uiTokens.colors.textSecondary }]}>Scanned</Text>
          </View>
          <Text style={[styles.statValue, { color: uiTokens.colors.textPrimary }]}>
            {sessionStats.scannedItems}
          </Text>
        </Animated.View>

        <View style={[styles.statDivider, dividerSurface]} />

        <Animated.View style={styles.statItem} entering={FadeInDown.delay(100).duration(300)}>
          <View style={styles.statHeader}>
            <Ionicons name="checkmark-circle-outline" size={14} color={uiTokens.colors.success} />
            <Text style={[styles.statLabel, { color: uiTokens.colors.textSecondary }]}>Verified</Text>
          </View>
          <Text style={[styles.statValue, { color: uiTokens.colors.success }]}>
            {sessionStats.verifiedItems}
          </Text>
        </Animated.View>

        <View style={[styles.statDivider, dividerSurface]} />

        <Animated.View style={styles.statItem} entering={FadeInDown.delay(150).duration(300)}>
          <View style={styles.statHeader}>
            <Ionicons name="time-outline" size={14} color={uiTokens.colors.warning} />
            <Text style={[styles.statLabel, { color: uiTokens.colors.textSecondary }]}>Pending</Text>
          </View>
          <Text style={[styles.statValue, { color: uiTokens.colors.warning }]}>
            {sessionStats.pendingItems}
          </Text>
        </Animated.View>
      </Animated.View>
    </ModernCard>
  );
}

const styles = StyleSheet.create({
  statsCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
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
  statHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  statValue: {
    fontSize: typography.fontSize["2xl"],
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  skeleton: {
    overflow: "hidden",
  },
  skeletonShimmer: {
    flex: 1,
  },
});
