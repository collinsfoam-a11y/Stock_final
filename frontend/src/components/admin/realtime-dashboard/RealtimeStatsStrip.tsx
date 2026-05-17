import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  DashboardStats,
  formatValue,
} from "@/components/admin/realtime-dashboard/realtimeDashboardShared";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";

interface RealtimeStatsStripProps {
  stats: DashboardStats | null;
}

export function RealtimeStatsStrip({ stats }: RealtimeStatsStripProps) {
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);

  if (!stats) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <StatsCard
          styles={styles}
          label="Total Items"
          value={stats.total_items}
          icon="cube"
          color={uiTokens.colors.success}
          format="number"
        />
        <StatsCard
          styles={styles}
          label="Verified"
          value={stats.verified_items}
          icon="checkmark-circle"
          color={uiTokens.colors.info}
          format="number"
        />
        <StatsCard
          styles={styles}
          label="Pending"
          value={stats.pending_items}
          icon="time"
          color={uiTokens.colors.warning}
          format="number"
        />
        <StatsCard
          styles={styles}
          label="Verification Rate"
          value={stats.verification_rate}
          icon="trending-up"
          color={uiTokens.colors.accent}
          format="percentage"
        />
        <StatsCard
          styles={styles}
          label="Total Variance"
          value={stats.total_variance}
          icon="analytics"
          color={stats.total_variance < 0 ? uiTokens.colors.error : uiTokens.colors.success}
          format="number"
        />
        <StatsCard
          styles={styles}
          label="Today's Activity"
          value={stats.today_activity}
          icon="today"
          color={uiTokens.colors.info}
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
  styles,
  value,
}: {
  color: string;
  format?: string;
  icon: string;
  label: string;
  styles: ReturnType<typeof createStyles>;
  value: number | string;
}) {
  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={[styles.iconContainer, { backgroundColor: colorWithAlpha(color, 0.12) }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.value}>{formatValue(value, format)}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

type RealtimeStatsTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: RealtimeStatsTokens) =>
  StyleSheet.create({
    container: {
      marginBottom: uiTokens.spacing.lg,
    },
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: uiTokens.colors.surface,
      borderRadius: uiTokens.radius.md,
      padding: uiTokens.spacing.md,
      marginRight: uiTokens.spacing.md,
      borderLeftWidth: 3,
      minWidth: 140,
    },
    iconContainer: {
      width: 36,
      height: 36,
      borderRadius: uiTokens.radius.full,
      justifyContent: "center",
      alignItems: "center",
      marginRight: uiTokens.spacing.sm,
    },
    textContainer: {
      flex: 1,
    },
    value: {
      fontSize: 18,
      fontWeight: "bold",
      color: uiTokens.colors.textPrimary,
    },
    label: {
      fontSize: 12,
      color: uiTokens.colors.textSecondary,
      marginTop: uiTokens.spacing.xxs,
    },
  });
