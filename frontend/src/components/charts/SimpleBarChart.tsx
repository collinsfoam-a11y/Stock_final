/**
 * Simple Bar Chart - View-based implementation (no SVG required)
 */

import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { useUiTokens } from "../../hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "../../theme/themeTokens";
import { font, gap, radius } from "@/theme/staffUiScale";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_WIDTH = SCREEN_WIDTH - gap.lg * 2 - 80;
const CHART_HEIGHT = 200;
const PADDING = 40;
const BAR_SPACING = 8;

interface BarData {
  label: string;
  value: number;
  color?: string;
}

interface SimpleBarChartProps {
  data: BarData[];
  title?: string;
  showValues?: boolean;
}

export const SimpleBarChart: React.FC<SimpleBarChartProps> = ({
  data,
  title,
  showValues = true,
}) => {
  const uiTokens = useUiTokens();
  const styles = React.useMemo(() => createStyles(uiTokens), [uiTokens]);

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

  const chartWidth = CHART_WIDTH - PADDING * 2;
  const chartHeight = CHART_HEIGHT - PADDING * 2;

  const maxValue = Math.max(...data.map((d) => d.value));
  const scale = chartHeight / (maxValue * 1.1);

  const barWidth = (chartWidth - (data.length - 1) * BAR_SPACING) / data.length;

  const gridLines = [];
  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const y = (chartHeight / gridSteps) * i;
    const value = Math.round(maxValue * (1 - i / gridSteps));
    gridLines.push({ y, value });
  }

  return (
    <View style={styles.container}>
      {!!title && <Text style={styles.title}>{title}</Text>}
      <View style={styles.chartContainer}>
        <View style={styles.yAxis}>
          {gridLines.map((line, i) => (
            <View key={i} style={[styles.yAxisLabel, { top: line.y - 8 }]}>
              <Text style={styles.yAxisText}>{line.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.chartArea}>
          {gridLines.map((line, i) => (
            <View
              key={i}
              style={[
                styles.gridLine,
                {
                  top: line.y,
                  width: chartWidth,
                },
              ]}
            />
          ))}

          <View
            style={[
              styles.axisLine,
              {
                bottom: 0,
                width: chartWidth,
              },
            ]}
          />
          <View
            style={[
              styles.axisLine,
              {
                left: 0,
                height: chartHeight,
                width: 2,
              },
            ]}
          />

          {data.map((item, index) => {
            const barHeight = item.value * scale;
            const x = index * (barWidth + BAR_SPACING);

            const color = item.color || uiTokens.colors.accent;

            return (
              <View key={index} style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    {
                      width: barWidth,
                      height: barHeight,
                      backgroundColor: color,
                      bottom: 0,
                      left: x,
                    },
                  ]}
                />
                {showValues && (
                  <View
                    style={[
                      styles.valueLabel,
                      {
                        bottom: barHeight + 4,
                        left: x + barWidth / 2,
                      },
                    ]}
                  >
                    <Text style={styles.valueText}>{item.value}</Text>
                  </View>
                )}
                <View
                  style={[
                    styles.xLabel,
                    {
                      bottom: -20,
                      left: x + barWidth / 2,
                    },
                  ]}
                >
                  <Text style={styles.xLabelText} numberOfLines={1}>
                    {item.label}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
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
    chartContainer: {
      flexDirection: "row",
      height: CHART_HEIGHT + 30,
    },
    yAxis: {
      width: PADDING,
      position: "relative",
    },
    yAxisLabel: {
      position: "absolute",
      right: gap.xs,
    },
    yAxisText: {
      fontSize: font.size.sm,
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
    },
    axisLine: {
      position: "absolute",
      backgroundColor: uiTokens.colors.border,
    },
    barContainer: {
      position: "absolute",
      width: "100%",
      height: "100%",
    },
    bar: {
      position: "absolute",
      borderRadius: radius.xs,
    },
    valueLabel: {
      position: "absolute",
      transform: [{ translateX: -20 }],
    },
    valueText: {
      fontSize: font.size.sm,
      color: uiTokens.colors.textPrimary,
      fontWeight: font.weight.semibold,
      textAlign: "center",
    },
    xLabel: {
      position: "absolute",
      transform: [{ translateX: -30 }],
      width: 60,
    },
    xLabelText: {
      fontSize: font.size.sm,
      color: uiTokens.colors.textSecondary,
      textAlign: "center",
    },
    emptyState: {
      height: CHART_HEIGHT,
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
