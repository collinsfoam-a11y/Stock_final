/**
 * ExceptionTriageList — exception-first dashboard triage (P3 / OXS §6.5).
 *
 * Renders {@link ExceptionTriageItem[]} sorted by severity (critical first) so
 * the most urgent operational exceptions lead the dashboard: failed sync, high
 * variance, stuck sessions, overdue recounts, rejected submissions.
 *
 * Each row is tappable and links to the affected record set (§6.5: "summary
 * metrics must link to the underlying record set"). Severity is colour-coded so
 * it is visible without opening detail.
 *
 * The list is bounded (one row per exception kind, each carrying an aggregate
 * count), so a plain map is appropriate — this is NOT an unbounded operational
 * list (§10.3 does not apply).
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated from "react-native-reanimated";

import { useUiTokens } from "../../hooks/useUiTokens";
import { useMotionAwareEntering } from "../../hooks/useMotionAwareEntering";
import { colorWithAlpha, type ThemeTokens } from "../../theme/themeTokens";
import { AppTouchable } from "../ui/AppTouchable";
import type { ExceptionTriageItem, ExceptionTriageKind, TriageSeverity } from "../../viewModels/types";

export interface ExceptionTriageListProps {
    items: ExceptionTriageItem[];
    /** Tap-through resolver: receives the item. */
    onPressItem?: (item: ExceptionTriageItem) => void;
}

const SEVERITY_RANK: Record<TriageSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
};

const SEVERITY_COLOR: Record<TriageSeverity, keyof ThemeTokens["colors"]> = {
    critical: "error",
    high: "warning",
    medium: "info",
};

const KIND_ICON: Record<ExceptionTriageKind, keyof typeof Ionicons.glyphMap> = {
    failed_sync: "cloud-offline-outline",
    high_variance: "trending-up-outline",
    stuck_session: "hourglass-outline",
    overdue_recount: "alert-circle-outline",
    rejected_submission: "close-circle-outline",
};

const sortBySeverity = (items: ExceptionTriageItem[]): ExceptionTriageItem[] =>
    [...items].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

/** Single triage row — a component so the entering hook is called at top level. */
const TriageRow: React.FC<{
    item: ExceptionTriageItem;
    index: number;
    onPress?: (item: ExceptionTriageItem) => void;
}> = ({ item, index, onPress }) => {
    const t = useUiTokens();
    const styles = makeStyles(t);
    const entering = useMotionAwareEntering({ delay: index * 60, durationKey: "fast" });
    const color = t.colors[SEVERITY_COLOR[item.severity]];
    const interactive = Boolean(onPress);

    const row = (
        <View
            style={[
                styles.row,
                { backgroundColor: t.colors.surface, borderColor: t.colors.border },
            ]}
        >
            <View style={[styles.iconWell, { backgroundColor: colorWithAlpha(color, 0.12) }]}>
                <Ionicons name={KIND_ICON[item.kind]} size={20} color={color} />
            </View>
            <View style={styles.copy}>
                <View style={styles.titleRow}>
                    <Text style={[styles.title, { color: t.colors.textPrimary }]} numberOfLines={1}>
                        {item.title}
                    </Text>
                    <View style={[styles.countBadge, { backgroundColor: colorWithAlpha(color, 0.16) }]}>
                        <Text style={[styles.countText, { color }]}>{item.count}</Text>
                    </View>
                </View>
                <Text style={[styles.description, { color: t.colors.textSecondary }]} numberOfLines={2}>
                    {item.description}
                </Text>
            </View>
            {interactive ? (
                <Ionicons name="chevron-forward" size={16} color={t.colors.textMuted} />
            ) : null}
        </View>
    );

    if (!interactive) {
        return (
            <Animated.View entering={entering}>{row}</Animated.View>
        );
    }

    return (
        <AppTouchable
            onPress={() => onPress?.(item)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.count} affected`}
        >
            <Animated.View entering={entering}>{row}</Animated.View>
        </AppTouchable>
    );
};

export const ExceptionTriageList: React.FC<ExceptionTriageListProps> = ({ items, onPressItem }) => {
    const t = useUiTokens();
    const styles = makeStyles(t);
    const ordered = React.useMemo(() => sortBySeverity(items), [items]);

    if (ordered.length === 0) return null;

    return (
        <View style={styles.list} accessibilityRole="list">
            {ordered.map((item, index) => (
                <TriageRow key={item.kind} item={item} index={index} onPress={onPressItem} />
            ))}
        </View>
    );
};

const makeStyles = (t: ThemeTokens) =>
    StyleSheet.create({
        list: {
            gap: t.spacing.sm,
        },
        row: {
            flexDirection: "row",
            alignItems: "center",
            gap: t.spacing.sm,
            padding: t.spacing.sm + t.spacing.xs,
            borderRadius: t.radius.md,
            borderWidth: 1,
        },
        iconWell: {
            width: 36,
            height: 36,
            borderRadius: t.radius.md,
            alignItems: "center",
            justifyContent: "center",
        },
        copy: {
            flex: 1,
            gap: 2,
        },
        titleRow: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: t.spacing.xs,
        },
        title: {
            fontSize: 14,
            fontWeight: "700",
            flexShrink: 1,
        },
        countBadge: {
            minWidth: 24,
            paddingHorizontal: t.spacing.xs,
            paddingVertical: 2,
            borderRadius: t.radius.full,
            alignItems: "center",
            justifyContent: "center",
        },
        countText: {
            fontSize: 12,
            fontWeight: "800",
        },
        description: {
            fontSize: 12,
            lineHeight: 16,
        },
    });
