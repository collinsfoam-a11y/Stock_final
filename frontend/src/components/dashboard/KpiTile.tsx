/**
 * KpiTile — canonical big-numeric dashboard metric (P3 / proposal §7.1).
 *
 * Renders one {@link DashboardKpiViewModel} with the big-numeric treatment:
 * large pre-formatted value, small label, optional trend arrow, and a
 * tap-through to the underlying record set (§6.5: "summary metrics must link").
 *
 * Authority boundary: this component only RENDERS the adapter-mapped view model.
 * It never recomputes, rounds, or formats the value. Absent values render an
 * em-dash with muted styling — never a coerced zero (CI-01).
 *
 * Motion discipline: the entrance uses {@link useMotionAwareEntering} so it is
 * automatically suppressed under reduced-motion / disabled-motion (§8).
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated from "react-native-reanimated";

import { useUiTokens } from "../../hooks/useUiTokens";
import { useMotionAwareEntering } from "../../hooks/useMotionAwareEntering";
import type { ThemeTokens } from "../../theme/themeTokens";
import { AppTouchable } from "../ui/AppTouchable";
import type { DashboardKpiViewModel, DashboardStatus } from "../../viewModels/types";

export interface KpiTileProps {
    vm: DashboardKpiViewModel;
    /** Tap-through handler. When omitted the tile is non-interactive. */
    onPress?: () => void;
    /** Stagger delay (ms) for the entering animation. */
    delay?: number;
}

const STATUS_COLOR: Record<DashboardStatus, keyof ThemeTokens["colors"]> = {
    primary: "accent",
    success: "success",
    warning: "warning",
    error: "error",
    info: "info",
};

const TREND_ICON = {
    up: "arrow-up" as const,
    down: "arrow-down" as const,
    flat: "remove" as const,
};

export const KpiTile: React.FC<KpiTileProps> = ({ vm, onPress, delay = 0 }) => {
    const t = useUiTokens();
    const styles = makeStyles(t);
    const entering = useMotionAwareEntering({ delay, durationKey: "normal" });

    const accent = t.colors[STATUS_COLOR[vm.status]];
    const interactive = Boolean(onPress);

    const accessibilityLabel = [
        vm.label,
        vm.isAbsent ? "no data" : vm.displayValue,
        vm.trend ? `${vm.trend.direction} ${vm.trend.delta}` : "",
    ]
        .filter(Boolean)
        .join(", ");

    const content = (
        <View
            style={[
                styles.root,
                { backgroundColor: t.colors.surface, borderColor: t.colors.border },
            ]}
        >
            <View style={[styles.accentBar, { backgroundColor: accent }]} />
            <View style={styles.body}>
                <Text
                    style={[styles.value, { color: vm.isAbsent ? t.colors.textMuted : t.colors.textPrimary }]}
                    numberOfLines={1}
                >
                    {vm.displayValue}
                </Text>
                <Text style={[styles.label, { color: t.colors.textSecondary }]} numberOfLines={1}>
                    {vm.label}
                </Text>
                {vm.trend ? (
                    <View style={styles.trendRow}>
                        <Ionicons
                            name={TREND_ICON[vm.trend.direction]}
                            size={13}
                            color={vm.trend.direction === "flat" ? t.colors.textMuted : accent}
                        />
                        <Text style={[styles.trendText, { color: t.colors.textSecondary }]}>
                            {vm.trend.delta > 0 ? "+" : ""}
                            {vm.trend.delta}
                            {vm.trend.label ? ` ${vm.trend.label}` : ""}
                        </Text>
                    </View>
                ) : null}
            </View>
            {interactive ? (
                <View style={styles.chevron}>
                    <Ionicons name="chevron-forward" size={16} color={t.colors.textMuted} />
                </View>
            ) : null}
        </View>
    );

    const wrapped = (
        <Animated.View entering={entering} style={styles.tile}>
            {content}
        </Animated.View>
    );

    if (!interactive) return wrapped;

    return (
        <AppTouchable
            onPress={onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={styles.tile}
        >
            {content}
        </AppTouchable>
    );
};

const makeStyles = (t: ThemeTokens) =>
    StyleSheet.create({
        tile: {
            flex: 1,
        },
        root: {
            flexDirection: "row",
            alignItems: "stretch",
            borderRadius: t.radius.lg,
            borderWidth: 1,
            overflow: "hidden",
            minHeight: 92,
        },
        accentBar: {
            width: 4,
        },
        body: {
            flex: 1,
            padding: t.spacing.sm + t.spacing.xs,
            justifyContent: "center",
            gap: 2,
        },
        value: {
            fontSize: 26,
            fontWeight: "800",
            letterSpacing: -0.5,
        },
        label: {
            fontSize: 12,
            fontWeight: "500",
        },
        trendRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 2,
            marginTop: 2,
        },
        trendText: {
            fontSize: 11,
            fontWeight: "600",
        },
        chevron: {
            justifyContent: "center",
            paddingRight: t.spacing.xs,
        },
    });
