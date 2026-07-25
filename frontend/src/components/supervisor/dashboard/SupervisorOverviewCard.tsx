import React, { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { AnimatedPressable, ModernCard, LiveIndicator } from "@/components/ui";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { font, gap, radius } from "@/theme/staffUiScale";

export interface OverviewAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  primary: boolean;
}

interface SupervisorOverviewCardProps {
  completionPercentage: number;
  highRiskSessions: number;
  openSessions: number;
  overviewActions: OverviewAction[];
}

export function SupervisorOverviewCard({
  completionPercentage,
  highRiskSessions,
  openSessions,
  overviewActions,
}: SupervisorOverviewCardProps) {
  const uiTokens = useUiTokens();
  const { width } = useWindowDimensions();
  const isCompact = width < 640;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        section: {
          marginBottom: gap.xl,
        },
        overviewCard: {
          borderRadius: radius.xl,
        },
        topRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: gap.md,
        },
        topRowCompact: {
          flexDirection: "column",
        },
        copy: {
          flex: 1,
          gap: gap.xs,
        },
        indicator: {
          alignSelf: "flex-start",
        },
        eyebrow: {
          fontSize: font.size.label,
          fontWeight: font.weight.bold,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        },
        title: {
          fontSize: font.size.xl,
          fontWeight: font.weight.bold,
          lineHeight: font.leading.relaxed,
        },
        titleCompact: {
          fontSize: font.size.lg,
          lineHeight: font.leading.normal,
        },
        subtitle: {
          fontSize: font.size.base,
          lineHeight: font.leading.normal,
        },
        metrics: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: gap.md,
          marginTop: gap.lg,
        },
        metricCard: {
          minWidth: 120,
          flex: 1,
          padding: gap.md,
          borderRadius: radius.lg,
          backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.06),
          borderWidth: 1,
          borderColor: colorWithAlpha(uiTokens.colors.accent, 0.12),
          gap: gap.xs,
        },
        metricValue: {
          fontSize: font.size.xl,
          fontWeight: font.weight.bold,
        },
        metricLabel: {
          fontSize: font.size.sm,
          fontWeight: font.weight.medium,
        },
        actions: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: gap.md,
          marginTop: gap.lg,
        },
        actionButton: {
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          gap: gap.sm,
          paddingHorizontal: gap.md,
          paddingVertical: gap.sm,
          borderRadius: radius.full,
          borderWidth: 1,
        },
        actionLabel: {
          fontSize: font.size.base,
          fontWeight: font.weight.semibold,
        },
      }),
    [uiTokens]
  );

  return (
    <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.section}>
      <ModernCard
        variant="outlined"
        elevation="none"
        intensity={25}
        padding={uiTokens.spacing.lg}
        style={styles.overviewCard}
      >
        <View style={[styles.topRow, isCompact && styles.topRowCompact]}>
          {isCompact ? (
            <View style={styles.indicator}>
              <LiveIndicator label="Real-time monitoring" size="small" />
            </View>
          ) : null}
          <View style={styles.copy}>
            <Text style={[styles.eyebrow, { color: uiTokens.colors.accentStrong }]}>
              Supervisor overview
            </Text>
            <Text
              style={[
                styles.title,
                isCompact && styles.titleCompact,
                { color: uiTokens.colors.textPrimary },
              ]}
            >
              Keep counting on track and fix issues early.
            </Text>
            <Text style={[styles.subtitle, { color: uiTokens.colors.textSecondary }]}>
              Track progress, check team activity, and resolve count differences from one place.
            </Text>
          </View>
          {!isCompact ? (
            <View style={styles.indicator}>
              <LiveIndicator label="Real-time monitoring" size="small" />
            </View>
          ) : null}
        </View>

        <View style={styles.metrics}>
          <View style={styles.metricCard}>
            <Text style={[styles.metricValue, { color: uiTokens.colors.textPrimary }]}>
              {openSessions}
            </Text>
            <Text style={[styles.metricLabel, { color: uiTokens.colors.textSecondary }]}>
              Open sessions
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={[styles.metricValue, { color: uiTokens.colors.textPrimary }]}>
              {highRiskSessions}
            </Text>
            <Text style={[styles.metricLabel, { color: uiTokens.colors.textSecondary }]}>
              High risk
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={[styles.metricValue, { color: uiTokens.colors.textPrimary }]}>
              {Math.round(completionPercentage)}%
            </Text>
            <Text style={[styles.metricLabel, { color: uiTokens.colors.textSecondary }]}>
              Completion
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          {overviewActions.map((action) => (
            <AnimatedPressable
              key={action.key}
              onPress={action.onPress}
              hapticFeedback="light"
              style={[
                styles.actionButton,
                {
                  backgroundColor: action.primary
                    ? uiTokens.colors.accentStrong
                    : uiTokens.colors.surface,
                  borderColor: action.primary
                    ? uiTokens.colors.accentStrong
                    : uiTokens.colors.border,
                },
              ]}
            >
              <Ionicons
                name={action.icon}
                size={18}
                color={
                  action.primary ? uiTokens.colors.surface : uiTokens.colors.textPrimary
                }
              />
              <Text
                style={[
                  styles.actionLabel,
                  {
                    color: action.primary
                      ? uiTokens.colors.surface
                      : uiTokens.colors.textPrimary,
                  },
                ]}
              >
                {action.label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      </ModernCard>
    </Animated.View>
  );
}
