import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "../../hooks/useUiTokens";
import { type ThemeTokens } from "../../theme/themeTokens";
import type { OptionalNumber, RecountComparisonViewModel } from "../../viewModels/types";

const fmt = (n: OptionalNumber): string => (n === null || n === undefined ? "—" : `${n}`);

interface Row {
    label: string;
    value: OptionalNumber;
    icon?: keyof typeof Ionicons.glyphMap;
}

export interface RecountComparisonProps {
    comparison: RecountComparisonViewModel;
}

/** Rows whose value is `undefined` were withheld upstream and are not rendered. */
const buildRows = (c: RecountComparisonViewModel): Row[] => {
    const rows: Row[] = [];
    if (!c.blinded) rows.push({ label: "Original count", value: c.originalCount ?? null, icon: "clipboard-outline" });
    rows.push({ label: "Recount count", value: c.recountCount, icon: "refresh-circle-outline" });
    rows.push({ label: "SQL at recount", value: c.sqlAtRecount, icon: "server-outline" });
    if (!c.blinded) rows.push({ label: "Difference", value: c.difference ?? null, icon: "swap-horizontal-outline" });
    if (!c.blinded) rows.push({ label: "Original variance", value: c.originalVariance ?? null, icon: "analytics-outline" });
    rows.push({ label: "Recount variance", value: c.recountVariance, icon: "trending-up-outline" });
    return rows;
};

export const RecountComparison: React.FC<RecountComparisonProps> = ({ comparison }) => {
    const t = useUiTokens();
    const styles = makeStyles(t);

    const visibleRows = buildRows(comparison);

    return (
        <View style={styles.root} accessibilityRole="summary" accessibilityLabel="Recount comparison">
            {comparison.blinded ? (
                <View style={[styles.blindNote, { backgroundColor: `${t.colors.accent}12`, borderColor: `${t.colors.accent}33` }]}>
                    <Ionicons name="eye-off-outline" size={18} color={t.colors.accent} />
                    <Text style={[styles.blindNoteText, { color: t.colors.textPrimary }]}>
                        Blind recount — the original count is hidden to preserve independence.
                    </Text>
                </View>
            ) : null}
            <View style={[styles.table, { borderColor: t.colors.border, backgroundColor: t.colors.surface }]}>
                {visibleRows.map((row) => (
                    <View key={row.label} style={[styles.tableRow, { borderColor: t.colors.border }]}>
                        <View style={styles.labelGroup}>
                            {row.icon && <Ionicons name={row.icon} size={16} color={t.colors.textSecondary} />}
                            <Text style={[styles.rowLabel, { color: t.colors.textSecondary }]}>{row.label}</Text>
                        </View>
                        <Text
                            style={[
                                styles.rowValue,
                                row.label === "Difference" || row.label.includes("variance")
                                    ? row.value !== null && row.value !== undefined && row.value < 0
                                        ? { color: t.colors.warning }
                                        : row.value !== null && row.value !== undefined && row.value > 0
                                            ? { color: t.colors.error }
                                            : { color: t.colors.success }
                                    : { color: t.colors.textPrimary },
                            ]}
                        >
                            {fmt(row.value)}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
};

const makeStyles = (t: ThemeTokens) =>
    StyleSheet.create({
        root: {
            gap: t.spacing.sm,
        },
        blindNote: {
            flexDirection: "row",
            alignItems: "center",
            gap: t.spacing.sm,
            padding: t.spacing.md,
            borderRadius: t.radius.md,
            borderWidth: 1,
        },
        blindNoteText: {
            flex: 1,
            fontSize: 13,
            fontWeight: "500",
            lineHeight: 18,
        },
        table: {
            borderRadius: t.radius.lg,
            borderWidth: 1,
            overflow: "hidden",
        },
        tableRow: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingVertical: t.spacing.sm + 2,
            paddingHorizontal: t.spacing.md,
            borderBottomWidth: 1,
        },
        labelGroup: {
            flexDirection: "row",
            alignItems: "center",
            gap: t.spacing.xs + 2,
        },
        rowLabel: {
            fontSize: 13,
            fontWeight: "500",
        },
        rowValue: {
            fontSize: 15,
            fontWeight: "700",
            fontVariant: ["tabular-nums"],
        },
    });
