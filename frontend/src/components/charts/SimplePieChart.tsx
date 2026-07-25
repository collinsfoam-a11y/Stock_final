/**
 * Simple Pie Chart - View-based implementation (no SVG required)
 * Text/surface colors resolve at runtime from useUiTokens (dark-mode aware).
 */

import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";

import { useUiTokens } from "../../hooks/useUiTokens";
import type { ThemeTokens } from "../../theme/themeTokens";
import { font, gap, radius } from "@/theme/staffUiScale";

const CHART_SIZE = 200;
const RADIUS = 80;

interface PieData {
  label: string;
  value: number;
  color?: string;
}

interface SimplePieChartProps {
  data: PieData[];
  title?: string;
  showLegend?: boolean;
}

const buildSeriesSequence = (uiTokens: ThemeTokens): string[] => [
  uiTokens.colors.accent,
  uiTokens.colors.success,
  uiTokens.colors.warning,
  uiTokens.colors.error,
  uiTokens.colors.info,
  uiTokens.colors.accentStrong,
];

export const SimplePieChart: React.FC<SimplePieChartProps> = ({
  data,
  title,
  showLegend = true,
}) => {
  const uiTokens = useUiTokens();
  const styles = React.useMemo(() => createStyles(uiTokens), [uiTokens]);
  const seriesSequence = React.useMemo(() => buildSeriesSequence(uiTokens), [uiTokens]);

  if (!data || data.length === 0) {
    return (
      <View style={styles.container}>
        {!!title && <Text style={styles.title}>{title}</Text>}
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No data available</Text>
        </View>
      </View>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  let currentAngle = -90;

  const segments = data.map((item, index) => {
    const percentage = item.value / total;
    const angle = percentage * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    return {
      ...item,
      color: item.color || seriesSequence[index % seriesSequence.length],
      percentage: percentage * 100,
      startAngle,
      endAngle,
      angle,
    };
  });

  const renderPieChart = () => {
    if (Platform.OS === "web") {
      const gradientStops = segments
        .map((seg, i) => {
          const startPercent =
            i === 0
              ? 0
              : segments.slice(0, i).reduce((sum, s) => sum + s.percentage, 0);
          return `${seg.color} ${startPercent}% ${startPercent + seg.percentage}%`;
        })
        .join(", ");

      return (
        <View
          style={[
            styles.pieChart,
            {
              backgroundColor: `conic-gradient(${gradientStops})`,
            },
          ]}
        />
      );
    } else {
      return (
        <View style={styles.pieChartContainer}>
          {segments.map((seg, index) => {
            const rotation = seg.startAngle;
            const sweepAngle = seg.angle;
            return (
              <View
                key={index}
                style={[
                  styles.pieSegment,
                  {
                    backgroundColor: seg.color,
                    transform: [{ rotate: `${rotation}deg` }],
                    width: RADIUS * 2,
                    height: RADIUS * 2,
                  },
                ]}
              >
                <View
                  style={[
                    styles.segmentMask,
                    {
                      transform: [{ rotate: `${sweepAngle}deg` }],
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
      );
    }
  };

  return (
    <View style={styles.container}>
      {!!title && <Text style={styles.title}>{title}</Text>}
      <View style={styles.chartWrapper}>
        <View style={styles.pieContainer}>
          {renderPieChart()}
          <View style={styles.centerLabel}>
            <Text style={styles.centerValue}>{total}</Text>
            <Text style={styles.centerText}>Total</Text>
          </View>
        </View>

        {showLegend && (
          <View style={styles.legend}>
            {segments.map((item, index) => (
              <View key={index} style={styles.legendItem}>
                <View
                  style={[styles.legendColor, { backgroundColor: item.color }]}
                />
                <View style={styles.legendContent}>
                  <Text style={styles.legendLabel}>{item.label}</Text>
                  <Text style={styles.legendValue}>
                    {item.value} ({item.percentage.toFixed(1)}%)
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const createStyles = (uiTokens: ThemeTokens) =>
  StyleSheet.create({
    container: {
      marginVertical: gap.md,
    },
    title: {
      fontSize: font.size.xl,
      fontWeight: font.weight.semibold,
      color: uiTokens.colors.textPrimary,
      marginBottom: gap.sm,
    },
    chartWrapper: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexWrap: "wrap",
      gap: gap.lg,
    },
    pieContainer: {
      width: CHART_SIZE,
      height: CHART_SIZE,
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
    },
    pieChart: {
      width: RADIUS * 2,
      height: RADIUS * 2,
      borderRadius: RADIUS,
    },
    pieChartContainer: {
      width: RADIUS * 2,
      height: RADIUS * 2,
      borderRadius: RADIUS,
      overflow: "hidden",
      position: "relative",
    },
    pieSegment: {
      position: "absolute",
      borderRadius: RADIUS,
      overflow: "hidden",
    },
    segmentMask: {
      width: "50%",
      height: "100%",
      backgroundColor: "transparent",
    },
    centerLabel: {
      position: "absolute",
      alignItems: "center",
      justifyContent: "center",
    },
    centerValue: {
      fontSize: font.size.xl,
      color: uiTokens.colors.textPrimary,
      fontWeight: font.weight.bold,
    },
    centerText: {
      fontSize: font.size.sm,
      color: uiTokens.colors.textSecondary,
    },
    legend: {
      gap: gap.sm,
      minWidth: 200,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: gap.sm,
    },
    legendColor: {
      width: 16,
      height: 16,
      borderRadius: radius.xs,
    },
    legendContent: {
      flex: 1,
    },
    legendLabel: {
      fontSize: font.size.sm,
      color: uiTokens.colors.textPrimary,
      fontWeight: font.weight.medium,
    },
    legendValue: {
      fontSize: font.size.sm,
      color: uiTokens.colors.textSecondary,
    },
    emptyState: {
      height: CHART_SIZE,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: uiTokens.colors.surface,
      borderRadius: 8,
    },
    emptyText: {
      fontSize: font.size.base,
      color: uiTokens.colors.textSecondary,
    },
  });
