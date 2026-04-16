import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { auroraTheme } from "@/theme/auroraTheme";
import {
  DashboardStats,
  formatValue,
} from "@/components/admin/realtime-dashboard/realtimeDashboardShared";

interface RealtimeStatsStripProps {
  stats: DashboardStats | null;
}

export function RealtimeStatsStrip({ stats }: RealtimeStatsStripProps) {
  if (!stats) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <StatsCard
          label="Total Items"
          value={stats.total_items}
          icon="cube"
          color="#4CAF50"
          format="number"
        />
        <StatsCard
          label="Verified"
          value={stats.verified_items}
          icon="checkmark-circle"
          color="#2196F3"
          format="number"
        />
        <StatsCard
          label="Pending"
          value={stats.pending_items}
          icon="time"
          color="#FF9800"
          format="number"
        />
        <StatsCard
          label="Verification Rate"
          value={stats.verification_rate}
          icon="trending-up"
          color="#9C27B0"
          format="percentage"
        />
        <StatsCard
          label="Total Variance"
          value={stats.total_variance}
          icon="analytics"
          color={stats.total_variance < 0 ? "#F44336" : "#4CAF50"}
          format="number"
        />
        <StatsCard
          label="Today's Activity"
          value={stats.today_activity}
          icon="today"
          color="#00BCD4"
          format="number"
        />
      </ScrollView>
    </View>
  );
}

function StatsCard({
  color,
  format,
  icon,
  label,
  value,
}: {
  color: string;
  format?: string;
  icon: string;
  label: string;
  value: number | string;
}) {
  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={[styles.iconContainer, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.value}>{formatValue(value, format)}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: auroraTheme.spacing.lg,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: auroraTheme.colors.surface.base,
    borderRadius: auroraTheme.borderRadius.md,
    padding: auroraTheme.spacing.md,
    marginRight: auroraTheme.spacing.md,
    borderLeftWidth: 3,
    minWidth: 140,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: auroraTheme.spacing.sm,
  },
  textContainer: {
    flex: 1,
  },
  value: {
    fontSize: 18,
    fontWeight: "bold",
    color: auroraTheme.colors.text.primary,
  },
  label: {
    fontSize: 12,
    color: auroraTheme.colors.text.secondary,
    marginTop: 2,
  },
});
