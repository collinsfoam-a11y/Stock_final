/**
 * RecountLineage — immutable recount version timeline (P0D / OXS Part D).
 *
 * Renders the `lineage` chain of a {@link RecountViewModel}. Each node is a
 * distinct, immutable count version (original + recounts linked by
 * `recount_of_id`). The backend never mutates a prior version — this component
 * only displays that chain so an operator/supervisor can audit who counted
 * what, when, and whether each pass was blind.
 *
 * Authority boundary: lineage nodes are read verbatim from the backend. The
 * component never reorders, merges, or infers versions.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "../../hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "../../theme/themeTokens";
import type { RecountVersionNode } from "../../viewModels/types";

export interface RecountLineageProps {
    nodes: RecountVersionNode[];
}

export const RecountLineage: React.FC<RecountLineageProps> = ({ nodes }) => {
    const t = useUiTokens();
    const styles = makeStyles(t);

    if (!nodes.length) {
        return (
            <Text style={styles.empty} accessibilityRole="text">
                No count versions recorded yet.
            </Text>
        );
    }

    return (
        <View accessibilityRole="list" accessibilityLabel="Recount version lineage">
            {nodes.map((node, i) => {
                const isLast = i === nodes.length - 1;
                return (
                    <View key={`${node.version}-${i}`} style={styles.nodeRow} accessibilityRole="text">
                        {/* Timeline rail */}
                        <View style={styles.rail}>
                            <View
                                style={[
                                    styles.dot,
                                    {
                                        backgroundColor: node.isRecount ? t.colors.accent : t.colors.success,
                                        borderColor: t.colors.surface,
                                    },
                                ]}
                            />
                            {!isLast ? <View style={[styles.connector, { backgroundColor: t.colors.border }]} /> : null}
                        </View>
                        {/* Node content */}
                        <View style={[styles.nodeCard, { borderColor: t.colors.border, backgroundColor: t.colors.surface }]}>
                            <View style={styles.nodeHeader}>
                                <Text style={styles.nodeVersion}>
                                    {node.isRecount ? `Recount v${node.version}` : `Original count (v${node.version})`}
                                </Text>
                                {node.isBlind ? (
                                    <View style={[styles.blindBadge, { backgroundColor: colorWithAlpha(t.colors.warning, 0.16) }]}>
                                        <Ionicons name="eye-off-outline" size={11} color={t.colors.warning} />
                                        <Text style={[styles.blindBadgeText, { color: t.colors.warning }]}>Blind</Text>
                                    </View>
                                ) : null}
                            </View>
                            <Text style={styles.nodeMeta}>
                                {node.countedBy}
                                {node.countedAt ? ` · ${new Date(node.countedAt).toLocaleString()}` : ""}
                            </Text>
                        </View>
                    </View>
                );
            })}
        </View>
    );
};

const makeStyles = (t: ThemeTokens) =>
    StyleSheet.create({
        empty: {
            fontSize: 13,
            color: t.colors.textMuted,
            fontStyle: "italic",
        },
        nodeRow: {
            flexDirection: "row",
        },
        rail: {
            width: 24,
            alignItems: "center",
        },
        dot: {
            width: 12,
            height: 12,
            borderRadius: 999,
            borderWidth: 2,
            marginTop: 4,
        },
        connector: {
            width: 2,
            flex: 1,
            minHeight: 20,
        },
        nodeCard: {
            flex: 1,
            marginBottom: t.spacing.sm,
            marginLeft: t.spacing.xs,
            padding: t.spacing.sm,
            borderRadius: t.radius.md,
            borderWidth: 1,
            gap: 2,
        },
        nodeHeader: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: t.spacing.xs,
        },
        nodeVersion: {
            fontSize: 13,
            fontWeight: "700",
            color: t.colors.textPrimary,
        },
        nodeMeta: {
            fontSize: 12,
            color: t.colors.textSecondary,
        },
        blindBadge: {
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 999,
        },
        blindBadgeText: {
            fontSize: 10,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: 0.3,
        },
    });
