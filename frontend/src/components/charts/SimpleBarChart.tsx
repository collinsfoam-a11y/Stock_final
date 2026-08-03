import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useUiTokens } from "@/hooks/useUiTokens";
import { borderRadius, spacing, typography } from "@/theme/unified";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_WIDTH = SCREEN_WIDTH - spacing.lg * 2 - 40;
const CHART_HEIGHT = 200;
const PADDING = 36;
const BAR_SPACING = 10;

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
  const t = useUiTokens();

  if (!data || data.length === 0) {
    return (
      <View style={styles.container}>
        {title && <Text style={[styles.title, { color: t.colors.textPrimary }]}>{title}</Text>}
        <View style={[styles.emptyState, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
          <Text style={[styles.emptyText, { color: t.colors.textMuted }]}>No data available</Text>
        </View>
      </View>
    );
  }

  const chartWidth = CHART_WIDTH - PADDING;
  const chartHeight = CHART_HEIGHT - PADDING;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const scale = chartHeight / (maxValue * 1.15);

  const barWidth = Math.max(16, (chartWidth - (data.length - 1) * BAR_SPACING) / data.length);

  // Generate grid lines
  const gridLines = [];
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const y = (chartHeight / gridSteps) * i;
    const value = Math.round(maxValue * (1 - i / gridSteps));
    gridLines.push({ y, value });
  }

  return (
    <View style={styles.container}>
      {title && <Text style={[styles.title, { color: t.colors.textPrimary }]}>{title}</Text>}
      <View style={[styles.chartCard, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
        <View style={styles.chartContainer}>
          {/* Y-axis labels */}
          <View style={styles.yAxis}>
            {gridLines.map((line, i) => (
              <View key={i} style={[styles.yAxisLabel, { top: line.y - 6 }]}>
                <Text style={[styles.yAxisText, { color: t.colors.textMuted }]}>{line.value}</Text>
              </View>
            ))}
          </View>

          {/* Chart area */}
          <View style={styles.chartArea}>
            {/* Grid lines */}
            {gridLines.map((line, i) => (
              <View
                key={i}
                style={[
                  styles.gridLine,
                  {
                    top: line.y,
                    width: "100%",
                    backgroundColor: t.colors.border,
                  },
                ]}
              />
            ))}

            {/* Bars */}
            {data.map((item, index) => {
              const barHeight = Math.max(4, item.value * scale);
              const x = index * (barWidth + BAR_SPACING);
              const color = item.color || t.colors.accent;

              return (
                <Animated.View key={index} style={styles.barContainer} entering={FadeInUp.delay(index * 50).duration(300)}>
                  <View
                    style={[
                      styles.bar,
                      {
                        width: barWidth,
                        height: barHeight,
                        backgroundColor: color,
                        bottom: 0,
                        left: x,
                        borderTopLeftRadius: borderRadius.xs + 2,
                        borderTopRightRadius: borderRadius.xs + 2,
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
                      <Text style={[styles.valueText, { color: t.colors.textPrimary }]}>{item.value}</Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.xLabel,
                      {
                        bottom: -22,
                        left: x + barWidth / 2,
                      },
                    ]}
                  >
                    <Text style={[styles.xLabelText, { color: t.colors.textSecondary }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </View>
                </Animated.View>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.md,
  },
  title: {
    fontSize: typography.fontSize.md,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  chartCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  chartContainer: {
    flexDirection: "row",
    height: CHART_HEIGHT + 24,
  },
  yAxis: {
    width: PADDING,
    position: "relative",
  },
  yAxisLabel: {
    position: "absolute",
    right: spacing.xs,
  },
  yAxisText: {
    fontSize: typography.fontSize.xs - 1,
    fontVariant: ["tabular-nums"],
  },
  chartArea: {
    flex: 1,
    position: "relative",
    height: CHART_HEIGHT,
  },
  gridLine: {
    position: "absolute",
    height: 1,
    opacity: 0.5,
  },
  barContainer: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  bar: {
    position: "absolute",
  },
  valueLabel: {
    position: "absolute",
    transform: [{ translateX: -20 }],
  },
  valueText: {
    fontSize: typography.fontSize.xs - 1,
    fontWeight: "700",
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  xLabel: {
    position: "absolute",
    transform: [{ translateX: -30 }],
    width: 60,
  },
  xLabelText: {
    fontSize: typography.fontSize.xs - 1,
    fontWeight: "500",
    textAlign: "center",
  },
  emptyState: {
    height: CHART_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    fontWeight: "500",
  },
});
