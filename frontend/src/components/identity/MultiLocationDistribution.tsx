/**
 * MultiLocationDistribution — same item, many locations (P0E / OXS Part I).
 *
 * Renders a {@link MultiLocationDistributionViewModel}. The central rule
 * (proposal §14.9): the same item appearing in several locations is
 * DISTRIBUTION, not duplication. Each (item, location) pair is a distinct
 * countable identity. This component lists every location with its count
 * status so an operator understands they must count each slot independently.
 *
 * Authority boundary: location entries + `alreadyCounted` flags come from the
 * backend via the adapter. The component never merges, dedupes, or decides
 * identity.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "../../hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "../../theme/themeTokens";
import type { LocationRef, MultiLocationDistributionViewModel, OptionalNumber } from "../../viewModels/types";

const fmt = (n: OptionalNumber): string => (n === null || n === undefined ? "—" : `${n}`);

const locationLabel = (loc: LocationRef): string =>
    [loc.floor && `Floor ${loc.floor}`, loc.rack && `Rack ${loc.rack}`, loc.warehouse].filter(Boolean).join(" · ") || "Unspecified location";

export interface MultiLocationDistributionProps {
    vm: MultiLocationDistributionViewModel;
}

export const MultiLocationDistribution: React.FC<MultiLocationDistributionProps> = ({ vm }) => {
    const t = useUiTokens();
    const styles = makeStyles(t);

    const countedCount = vm.locations.filter((l) => l.alreadyCounted).length;

    return (
        <View style={styles.root} accessibilityRole="summary">
            <View style={styles.header}>
                <View style={styles.itemMeta}>
                    <Text style={styles.itemName} numberOfLines={2}>{vm.itemName}</Text>
                    <Text style={styles.itemCode}>{vm.itemCode}</Text>
                </View>
                <View style={[styles.countPill, { backgroundColor: colorWithAlpha(t.colors.accent, 0.12) }]}>
                    <Text style={[styles.countPillText, { color: t.colors.accent }]}>
                        {countedCount}/{vm.totalLocations} counted
                    </Text>
                </View>
            </View>

            <View style={[styles.note, { backgroundColor: colorWithAlpha(t.colors.info ?? t.colors.accent, 0.1), borderColor: colorWithAlpha(t.colors.info ?? t.colors.accent, 0.25) }]}>
                <Ionicons name="information-circle-outline" size={15} color={t.colors.info ?? t.colors.accent} />
                <Text style={styles.noteText}>
                    This item exists in {vm.totalLocations} location{vm.totalLocations === 1 ? "" : "s"}. Each location is a separate count — this is normal distribution, not a duplicate.
                </Text>
            </View>

            <View style={styles.list}>
                {vm.locations.map((entry, i) => (
                    <View
                        key={`${entry.identityKey || "loc"}-${i}`}
                        style={[styles.locRow, { borderColor: t.colors.border, backgroundColor: t.colors.surface }]}
                        accessibilityRole="text"
                        accessibilityLabel={`${locationLabel(entry.location)}. ${entry.alreadyCounted ? "Already counted" : "Not yet counted"}.`}
                    >
                        <Ionicons
                            name={entry.alreadyCounted ? "checkmark-circle" : "ellipse-outline"}
                            size={18}
                            color={entry.alreadyCounted ? t.colors.success : t.colors.textMuted}
                        />
                        <View style={styles.locCopy}>
                            <Text style={styles.locLabel}>{locationLabel(entry.location)}</Text>
                            {entry.alreadyCounted ? (
                                <Text style={styles.locStatus}>
                                    Counted{entry.countedQty !== null && entry.countedQty !== undefined ? ` · ${fmt(entry.countedQty)} units` : ""}
                                </Text>
                            ) : (
                                <Text style={[styles.locStatus, { color: t.colors.textMuted }]}>Awaiting count</Text>
                            )}
                        </View>
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
        header: {
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: t.spacing.sm,
        },
        itemMeta: {
            flex: 1,
            gap: 2,
        },
        itemName: {
            fontSize: 15,
            fontWeight: "700",
            color: t.colors.textPrimary,
        },
        itemCode: {
            fontSize: 12,
            color: t.colors.textSecondary,
        },
        countPill: {
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
        },
        countPillText: {
            fontSize: 12,
            fontWeight: "800",
        },
        note: {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: t.spacing.xs,
            padding: t.spacing.sm,
            borderRadius: t.radius.md,
            borderWidth: 1,
        },
        noteText: {
            flex: 1,
            fontSize: 12,
            color: t.colors.textSecondary,
            lineHeight: 16,
        },
        list: {
            gap: t.spacing.xs,
        },
        locRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: t.spacing.sm,
            padding: t.spacing.sm,
            borderRadius: t.radius.md,
            borderWidth: 1,
        },
        locCopy: {
            flex: 1,
            gap: 1,
        },
        locLabel: {
            fontSize: 13,
            fontWeight: "600",
            color: t.colors.textPrimary,
        },
        locStatus: {
            fontSize: 11,
            color: t.colors.success,
            fontWeight: "600",
        },
    });
