import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { auroraTheme } from "@/theme/auroraTheme";
import { Summary } from "@/components/admin/realtime-dashboard/realtimeDashboardShared";

interface RealtimeDashboardSummaryProps {
  summary: Summary | null;
}

export function RealtimeDashboardSummary({
  summary,
}: RealtimeDashboardSummaryProps) {
  if (!summary?.aggregations || Object.keys(summary.aggregations).length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Summary</Text>
      <View style={styles.grid}>
        {summary.aggregations.total_items !== undefined && (
          <AggregationCard
            label="Total Items"
            value={summary.aggregations.total_items.toLocaleString()}
          />
        )}
        {summary.aggregations.total_variance !== undefined && (
          <AggregationCard
            label="Total Variance"
            value={summary.aggregations.total_variance.toLocaleString()}
            valueStyle={
              summary.aggregations.total_variance < 0
                ? styles.negativeValue
                : styles.positiveValue
            }
          />
        )}
        {summary.aggregations.total_value !== undefined && (
          <AggregationCard
            label="Total Value"
            value={`₹${summary.aggregations.total_value.toLocaleString("en-IN")}`}
          />
        )}
        {summary.aggregations.verified_count !== undefined && (
          <AggregationCard
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
  value,
  valueStyle,
}: {
  label: string;
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: auroraTheme.colors.surface.base,
    borderRadius: auroraTheme.borderRadius.lg,
    padding: auroraTheme.spacing.lg,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    color: auroraTheme.colors.text.primary,
    marginBottom: auroraTheme.spacing.md,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: auroraTheme.spacing.md,
  },
  item: {
    flex: 1,
    minWidth: 120,
    backgroundColor: auroraTheme.colors.surface.elevated,
    borderRadius: auroraTheme.borderRadius.md,
    padding: auroraTheme.spacing.md,
    alignItems: "center",
  },
  value: {
    fontSize: 20,
    fontWeight: "bold",
    color: auroraTheme.colors.text.primary,
  },
  label: {
    fontSize: 12,
    color: auroraTheme.colors.text.secondary,
    marginTop: 4,
  },
  negativeValue: {
    color: "#F44336",
  },
  positiveValue: {
    color: "#4CAF50",
  },
});
