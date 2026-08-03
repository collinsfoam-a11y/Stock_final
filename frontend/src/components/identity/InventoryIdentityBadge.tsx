/**
 * InventoryIdentityBadge — identity tuple + duplicate verdict (P0E / OXS Part I).
 *
 * Renders an {@link InventoryIdentityViewModel}: the item, optional batch/serial,
 * and the Floor/Rack location that together define the countable identity. The
 * `alreadyCounted` indicator is the backend's authoritative duplicate verdict
 * (R7) — displayed, never recomputed.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "../../hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "../../theme/themeTokens";
import type { InventoryIdentityViewModel, LocationRef } from "../../viewModels/types";

const locationLabel = (loc: LocationRef): string =>
    [loc.warehouse, loc.floor && `Floor ${loc.floor}`, loc.rack && `Rack ${loc.rack}`].filter(Boolean).join(" · ") || "No location";

export interface InventoryIdentityBadgeProps {
    vm: InventoryIdentityViewModel;
    /** Called when the user taps "view existing" on an already-counted identity. */
    onViewExisting?: (existingCountId?: string) => void;
}

export const InventoryIdentityBadge: React.FC<InventoryIdentityBadgeProps> = ({ vm, onViewExisting }) => {
    const t = useUiTokens();
    const styles = makeStyles(t);

    return (
        <View
            style={[styles.root, { borderColor: vm.alreadyCounted ? colorWithAlpha(t.colors.warning, 0.4) : t.colors.border }]}
            accessibilityRole="summary"
            accessibilityLabel={`Identity: ${vm.itemName}, ${locationLabel(vm.location)}. ${vm.alreadyCounted ? "Already counted in this location." : "Not yet counted here."}`}
        >
            <View style={styles.header}>
                <View style={styles.itemMeta}>
                    <Text style={styles.itemName} numberOfLines={2}>{vm.itemName}</Text>
                    <Text style={styles.itemCode}>{vm.itemCode}</Text>
                </View>
                {vm.alreadyCounted ? (
                    <View style={[styles.verdictBadge, { backgroundColor: colorWithAlpha(t.colors.warning, 0.16) }]}>
                        <Ionicons name="checkmark-done" size={12} color={t.colors.warning} />
                        <Text style={[styles.verdictText, { color: t.colors.warning }]}>Counted here</Text>
                    </View>
                ) : null}
            </View>

            {/* Identity tuple */}
            <View style={styles.tupleRow}>
                {vm.batchNo ? <Chip label={`Batch ${vm.batchNo}`} tone="accent" /> : null}
                {vm.serialNo ? <Chip label={`S/N ${vm.serialNo}`} tone="accent" /> : null}
                <Chip label={locationLabel(vm.location)} tone="location" />
            </View>

            {vm.alreadyCounted && onViewExisting ? (
                <Text
                    style={styles.viewLink}
                    onPress={() => onViewExisting(vm.existingCountId)}
                    accessibilityRole="link"
                    accessibilityLabel="View the existing count for this identity"
                >
                    View existing count →
                </Text>
            ) : null}
        </View>
    );
};

interface ChipProps {
    label: string;
    tone: "accent" | "location";
}

const Chip: React.FC<ChipProps> = ({ label, tone }) => {
    const t = useUiTokens();
    const color = tone === "location" ? t.colors.textSecondary : t.colors.accent;
    return (
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colorWithAlpha(color, 0.1) }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color }}>{label}</Text>
        </View>
    );
};

const makeStyles = (t: ThemeTokens) =>
    StyleSheet.create({
        root: {
            gap: t.spacing.xs,
            padding: t.spacing.md,
            borderRadius: t.radius.md,
            borderWidth: 1,
            backgroundColor: t.colors.surface,
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
        verdictBadge: {
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            paddingHorizontal: 7,
            paddingVertical: 3,
            borderRadius: 999,
        },
        verdictText: {
            fontSize: 10,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.3,
        },
        tupleRow: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: t.spacing.xxs,
        },
        viewLink: {
            fontSize: 13,
            fontWeight: "700",
            color: t.colors.accent,
            marginTop: 2,
        },
    });
