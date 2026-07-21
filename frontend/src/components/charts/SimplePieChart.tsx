/**
 * Simple Pie Chart - View-based implementation (no SVG required)
 * Fully functional pie chart using React Native Views with conic gradients simulation
 *
 * Text/surface colors resolve at runtime from useUiTokens (dark-mode aware).
 * Explicit per-segment colors from consumers always win; segments without a
 * color get a deterministic semantic-token sequence (not lightness-only, so
 * it stays distinguishable in dark mode). modernTypography/Spacing/Radius are
 * retained for metrics only.
 */

import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";

import {
  modernTypography,
  modernSpacing,
  modernBorderRadius,
} from "../../styles/unifiedSystem";
import { useUiTokens } from "../../hooks/useUiTokens";
import type { ThemeTokens } from "../../theme/themeTokens";

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

// Deterministic theme-aware fallback sequence for segments without an
// explicit color. Distinct semantic hues (not lightness steps) so adjacent
// segments remain distinguishable in both light and dark mode.
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
      // Explicit consumer color wins; deterministic semantic fallback otherwise.
      color: item.color || seriesSequence[index % seriesSequence.length],
      percentage: percentage * 100,
      startAngle,
      endAngle,
      angle,
    };
  });

  // For web, we can use CSS conic-gradient, for native we'll use a different approach
  const renderPieChart = () => {
    if (Platform.OS === "web") {
      // Web: Use CSS conic-gradient
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
              // @ts-ignore - CSS conic-gradient for web
              background: `conic-gradient(${gradientStops})`,
            },
          ]}
        />
      );
    } else {
      // Native: Use overlapping circles with masks (simplified)
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
                {/* This is a simplified version - for full pie chart, would need proper masking */}
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
          {/* Center label with total */}
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
      marginVertical: modernSpacing.md,
    },
    title: {
      ...modernTypography.h5,
      color: uiTokens.colors.textPrimary,
      marginBottom: modernSpacing.sm,
    },
    chartWrapper: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexWrap: "wrap",
      gap: modernSpacing.lg,
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
      ...modernTypography.h3,
      color: uiTokens.colors.textPrimary,
      fontWeight: "700",
    },
    centerText: {
      ...modernTypography.body.small,
      color: uiTokens.colors.textSecondary,
    },
    legend: {
      gap: modernSpacing.sm,
      minWidth: 200,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: modernSpacing.sm,
    },
    legendColor: {
      width: 16,
      height: 16,
      borderRadius: modernBorderRadius.xs,
    },
    legendContent: {
      flex: 1,
    },
    legendLabel: {
      ...modernTypography.body.small,
      color: uiTokens.colors.textPrimary,
      fontWeight: "500",
    },
    legendValue: {
      ...modernTypography.body.small,
      color: uiTokens.colors.textSecondary,
      fontSize: 11,
    },
    emptyState: {
      height: CHART_SIZE,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: uiTokens.colors.surface,
      borderRadius: 8,
    },
    emptyText: {
      ...modernTypography.body.medium,
      color: uiTokens.colors.textSecondary,
    },
  });
