/**
 * Simple Line Chart - View-based implementation (no SVG required)
 * Fully functional line chart using React Native Views
 *
 * Colors resolve at runtime from useUiTokens (dark-mode aware); explicit
 * color props from consumers always win. modernTypography/modernSpacing are
 * retained for metrics only (no color usage).
 */

import React from "react";
import { View, Text, StyleSheet, Dimensions, Platform } from "react-native";
import { modernTypography, modernSpacing } from "../../styles/modernDesignSystem";
import { useUiTokens } from "../../hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "../../theme/themeTokens";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_WIDTH = SCREEN_WIDTH - modernSpacing.lg * 2 - 80;
const CHART_HEIGHT = 200;
const PADDING = 40;

interface DataPoint {
  x: number | string;
  y: number;
  label?: string;
}

interface SimpleLineChartProps {
  data: DataPoint[];
  color?: string;
  showGrid?: boolean;
  showPoints?: boolean;
  title?: string;
  yAxisLabel?: string;
  xAxisLabel?: string;
}

export const SimpleLineChart: React.FC<
  SimpleLineChartProps & {
    gridColor?: string;
    textColor?: string;
    axisColor?: string;
  }
> = ({
  data,
  color,
  showGrid = true,
  showPoints = true,
  title,
  yAxisLabel,
  xAxisLabel,
  gridColor,
  textColor,
  axisColor,
}) => {
  const uiTokens = useUiTokens();
  const styles = React.useMemo(() => createStyles(uiTokens), [uiTokens]);

  // Explicit consumer props win; semantic theme tokens are the defaults.
  const seriesColor = color ?? uiTokens.colors.accent;
  const resolvedGridColor = gridColor ?? colorWithAlpha(uiTokens.colors.border, 0.6);
  const resolvedTextColor = textColor ?? uiTokens.colors.textSecondary;
  const resolvedAxisColor = axisColor ?? uiTokens.colors.border;

  if (!data || data.length === 0) {
    return (
      <View style={styles.container}>
        {!!title && <Text style={[styles.title, { color: resolvedTextColor }]}>{title}</Text>}
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: resolvedTextColor }]}>No data available</Text>
        </View>
      </View>
    );
  }

  const chartWidth = CHART_WIDTH - PADDING * 2;
  const chartHeight = CHART_HEIGHT - PADDING * 2;

  const yValues = data.map((d) => d.y);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const yRange = maxY - minY || 1;
  const yPadding = yRange * 0.1;

  const scaleX = chartWidth / (data.length - 1 || 1);
  const scaleY = chartHeight / (yRange + yPadding * 2);

  const points = data.map((point, index) => {
    const x = index * scaleX;
    const y = chartHeight - (point.y - minY + yPadding) * scaleY;
    return { x, y, value: point.y, label: point.label || String(point.x) };
  });

  // Generate grid lines
  const gridLines = [];
  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const y = (chartHeight / gridSteps) * i;
    const value = maxY - (yRange / gridSteps) * i;
    gridLines.push({ y, value });
  }

  // Generate x-axis labels
  const xLabels = data
    .filter((_, i) => i % Math.ceil(data.length / 5) === 0 || i === data.length - 1)
    .map((point) => ({
      x: data.indexOf(point) * scaleX,
      label: String(point.x),
    }));

  return (
    <View style={styles.container}>
      {!!title && <Text style={[styles.title, { color: resolvedTextColor }]}>{title}</Text>}
      {yAxisLabel && (
        <Text style={[styles.yAxisLabel, { color: resolvedTextColor }]}>{yAxisLabel}</Text>
      )}
      <View style={styles.chartContainer}>
        {/* Y-axis labels */}
        <View style={styles.yAxis}>
          {gridLines.map((line, i) => (
            <View key={i} style={[styles.yAxisLabelContainer, { top: line.y }]}>
              <Text style={[styles.yAxisText, { color: resolvedTextColor }]}>
                {Math.round(line.value)}
              </Text>
            </View>
          ))}
        </View>

        {/* Chart area */}
        <View style={styles.chartArea}>
          {/* Grid lines */}
          {showGrid &&
            gridLines.map((line, i) => (
              <View
                key={i}
                style={[
                  styles.gridLine,
                  {
                    top: line.y,
                    width: chartWidth,
                    backgroundColor: resolvedGridColor,
                    ...(Platform.OS === "web" && { borderTopColor: resolvedGridColor }),
                  },
                ]}
              />
            ))}

          {/* X-axis line */}
          <View
            style={[
              styles.axisLine,
              {
                bottom: 0,
                width: chartWidth,
                backgroundColor: resolvedAxisColor,
              },
            ]}
          />

          {/* Y-axis line */}
          <View
            style={[
              styles.axisLine,
              {
                left: 0,
                height: chartHeight,
                width: 2,
                backgroundColor: resolvedAxisColor,
              },
            ]}
          />

          {/* Line segments */}
          {points.map((point, index) => {
            if (index === 0) return null;
            const prevPoint = points[index - 1];
            if (!prevPoint) return null;
            const dx = point.x - prevPoint.x;
            const dy = point.y - prevPoint.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            return (
              <View
                key={`line-${index}`}
                style={[
                  styles.lineSegment,
                  {
                    left: prevPoint.x,
                    top: prevPoint.y,
                    width: length,
                    transform: [{ rotate: `${angle}deg` }],
                    backgroundColor: seriesColor,
                  },
                ]}
              />
            );
          })}

          {/* Data points */}
          {showPoints &&
            points.map((point, index) => (
              <View
                key={`point-${index}`}
                style={[
                  styles.point,
                  {
                    left: point.x - 4,
                    top: point.y - 4,
                    backgroundColor: seriesColor,
                  },
                ]}
              >
                {Platform.OS === "web" && (
                  <View style={styles.tooltip}>
                    <Text style={styles.tooltipText}>{point.value}</Text>
                  </View>
                )}
              </View>
            ))}

          {/* X-axis labels */}
          <View style={styles.xAxis}>
            {xLabels.map((label, i) => (
              <View key={i} style={[styles.xAxisLabel, { left: label.x }]}>
                <Text style={[styles.xAxisText, { color: resolvedTextColor }]}>{label.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
      {xAxisLabel && (
        <Text style={[styles.xAxisLabelText, { color: resolvedTextColor }]}>{xAxisLabel}</Text>
      )}
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
    yAxisLabel: {
      ...modernTypography.body.small,
      color: uiTokens.colors.textSecondary,
      marginBottom: modernSpacing.xs,
    },
    chartContainer: {
      flexDirection: "row",
      height: CHART_HEIGHT,
    },
    yAxis: {
      width: PADDING,
      position: "relative",
    },
    yAxisLabelContainer: {
      position: "absolute",
      right: modernSpacing.xs,
      transform: [{ translateY: -8 }],
    },
    yAxisText: {
      ...modernTypography.body.small,
      fontSize: 10,
      color: uiTokens.colors.textSecondary,
    },
    chartArea: {
      flex: 1,
      position: "relative",
      height: CHART_HEIGHT,
    },
    gridLine: {
      position: "absolute",
      height: 1,
      backgroundColor: colorWithAlpha(uiTokens.colors.border, 0.6),
      opacity: 0.3,
      borderStyle: "dashed",
      ...(Platform.OS === "web" && {
        borderTopWidth: 1,
        borderTopColor: colorWithAlpha(uiTokens.colors.border, 0.6),
        borderStyle: "dashed" as const,
      }),
    },
    axisLine: {
      position: "absolute",
      backgroundColor: uiTokens.colors.border,
    },
    lineSegment: {
      position: "absolute",
      height: 3,
      borderRadius: 1.5,
    },
    point: {
      position: "absolute",
      width: 8,
      height: 8,
      borderRadius: 4,
      borderWidth: 2,
      // Point outline contrasts against the chart surface in both modes.
      borderColor: uiTokens.colors.surfaceElevated,
    },
    tooltip: {
      position: "absolute",
      bottom: 12,
      left: -20,
      backgroundColor: uiTokens.colors.surfaceElevated,
      paddingHorizontal: modernSpacing.xs,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
      minWidth: 40,
      alignItems: "center",
    },
    tooltipText: {
      ...modernTypography.body.small,
      fontSize: 10,
      color: uiTokens.colors.textPrimary,
      fontWeight: "600",
    },
    xAxis: {
      position: "absolute",
      bottom: -20,
      width: "100%",
      height: 20,
    },
    xAxisLabel: {
      position: "absolute",
      transform: [{ translateX: -20 }],
    },
    xAxisText: {
      ...modernTypography.body.small,
      fontSize: 10,
      color: uiTokens.colors.textSecondary,
      textAlign: "center",
    },
    xAxisLabelText: {
      ...modernTypography.body.small,
      color: uiTokens.colors.textSecondary,
      textAlign: "center",
      marginTop: modernSpacing.md,
    },
    emptyState: {
      height: CHART_HEIGHT,
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
