/**
 * RecountComparison — original vs recount comparison (P0D / OXS Part D).
 *
 * Renders a {@link RecountComparisonViewModel}. Blind integrity is enforced
 * UPSTREAM, in `toRecountViewModel`: when the viewer is the blind counter the
 * blind-sensitive fields (originalCount, originalVariance, difference) are
 * absent from the view model entirely, so the prior value never reaches these
 * props. This component therefore renders whatever is present and does not
 * decide what to hide — a render-time filter would still leave the value in
 * inspectable client state (§14.6).
 *
 * `difference` sits in the withheld set because `originalCount ===
 * recountCount − difference`; showing it alongside the recount would hand back
 * the number the blind rule exists to conceal.
 *
 * Authority boundary: every value is read verbatim from the view model. The
 * component never recomputes a delta or variance.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { useUiTokens } from "../../hooks/useUiTokens";
import { type ThemeTokens } from "../../theme/themeTokens";
import type { OptionalNumber, RecountComparisonViewModel } from "../../viewModels/types";

const fmt = (n: OptionalNumber): string => (n === null || n === undefined ? "—" : `${n}`);

interface Row {
    label: string;
    value: OptionalNumber;
}

export interface RecountComparisonProps {
    comparison: RecountComparisonViewModel;
}

/** Rows whose value is `undefined` were withheld upstream and are not rendered. */
const buildRows = (c: RecountComparisonViewModel): Row[] => {
    const rows: Row[] = [];
    if (!c.blinded) rows.push({ label: "Original count", value: c.originalCount ?? null });
    rows.push({ label: "Recount count", value: c.recountCount });
    rows.push({ label: "SQL at recount", value: c.sqlAtRecount });
    if (!c.blinded) rows.push({ label: "Difference", value: c.difference ?? null });
    if (!c.blinded) rows.push({ label: "Original variance", value: c.originalVariance ?? null });
    rows.push({ label: "Recount variance", value: c.recountVariance });
    return rows;
};

export const RecountComparison: React.FC<RecountComparisonProps> = ({ comparison }) => {
    const t = useUiTokens();
    const styles = makeStyles(t);

    const visibleRows = buildRows(comparison);

    return (
        <View style={styles.root} accessibilityRole="summary" accessibilityLabel="Recount comparison">
            {comparison.blinded ? (
                <View style={[styles.blindNote, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                    <Text style={styles.blindNoteText}>
                        Blind recount — the original count is hidden to preserve independence.
                    </Text>
                </View>
            ) : null}
            <View style={[styles.table, { borderColor: t.colors.border }]}>
                {visibleRows.map((row) => (
                    <View key={row.label} style={[styles.tableRow, { borderColor: t.colors.border }]}>
                        <Text style={styles.rowLabel}>{row.label}</Text>
                        <Text
                            style={[
                                styles.rowValue,
                                row.label === "Difference" || row.label.includes("variance")
                                    ? row.value !== null && row.value !== undefined && row.value < 0
                                        ? { color: t.colors.warning }
                                        : row.value !== null && row.value !== undefined && row.value > 0
                                            ? { color: t.colors.error }
                                            : undefined
                                    : undefined,
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
            padding: t.spacing.sm,
            borderRadius: t.radius.md,
            borderWidth: 1,
        },
        blindNoteText: {
            fontSize: 12,
            fontStyle: "italic",
            color: t.colors.textSecondary,
            lineHeight: 16,
        },
        table: {
            borderRadius: t.radius.md,
            borderWidth: 1,
            overflow: "hidden",
        },
        tableRow: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingVertical: t.spacing.sm,
            paddingHorizontal: t.spacing.md,
            borderBottomWidth: 1,
        },
        rowLabel: {
            fontSize: 13,
            color: t.colors.textSecondary,
        },
        rowValue: {
            fontSize: 15,
            fontWeight: "700",
            color: t.colors.textPrimary,
        },
    });
