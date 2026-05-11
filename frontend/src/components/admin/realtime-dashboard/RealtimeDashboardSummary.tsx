import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Summary } from "@/components/admin/realtime-dashboard/realtimeDashboardShared";
import { useUiTokens } from "@/hooks/useUiTokens";

interface RealtimeDashboardSummaryProps {
  summary: Summary | null;
}

export function RealtimeDashboardSummary({ summary }: RealtimeDashboardSummaryProps) {
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);

  if (!summary?.aggregations || Object.keys(summary.aggregations).length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Summary</Text>
      <View style={styles.grid}>
        {summary.aggregations.total_items !== undefined && (
          <AggregationCard
            styles={styles}
            label="Total Items"
            value={summary.aggregations.total_items.toLocaleString()}
          />
        )}
        {summary.aggregations.total_variance !== undefined && (
          <AggregationCard
            styles={styles}
            label="Total Variance"
            value={summary.aggregations.total_variance.toLocaleString()}
            valueStyle={
              summary.aggregations.total_variance < 0 ? styles.negativeValue : styles.positiveValue
            }
          />
        )}
        {summary.aggregations.total_value !== undefined && (
          <AggregationCard
            styles={styles}
            label="Total Value"
            value={`₹${summary.aggregations.total_value.toLocaleString("en-IN")}`}
          />
        )}
        {summary.aggregations.verified_count !== undefined && (
          <AggregationCard
            styles={styles}
            label="Verified Count"
            value={summary.aggregations.verified_count.toLocaleString()}
          />
        )}
      </View>
    </View>
  );
}

function AggregationCard({
  label,
  styles,
  value,
  valueStyle,
}: {
  label: string;
  styles: ReturnType<typeof createStyles>;
  value: string;
  valueStyle?: object;
}) {
  return (
    <View style={styles.item}>
      <Text style={[styles.value, valueStyle]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

type RealtimeSummaryTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: RealtimeSummaryTokens) =>
  StyleSheet.create({
    container: {
      backgroundColor: uiTokens.colors.surface,
      borderRadius: uiTokens.radius.lg,
      padding: uiTokens.spacing.lg,
    },
    title: {
      fontSize: 16,
      fontWeight: "bold",
      color: uiTokens.colors.textPrimary,
      marginBottom: uiTokens.spacing.md,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: uiTokens.spacing.md,
    },
    item: {
      flex: 1,
      minWidth: 120,
      backgroundColor: uiTokens.colors.surfaceElevated,
      borderRadius: uiTokens.radius.md,
      padding: uiTokens.spacing.md,
      alignItems: "center",
    },
    value: {
      fontSize: 20,
      fontWeight: "bold",
      color: uiTokens.colors.textPrimary,
    },
    label: {
      fontSize: 12,
      color: uiTokens.colors.textSecondary,
      marginTop: uiTokens.spacing.xs,
    },
    negativeValue: {
      color: uiTokens.colors.error,
    },
    positiveValue: {
      color: uiTokens.colors.success,
    },
  });
