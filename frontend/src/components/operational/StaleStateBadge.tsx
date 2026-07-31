/**
 * StaleStateBadge — stale-data caveat tokens (P0F / OXS Part I).
 *
 * Renders one or more {@link StaleStateReason}s as compact warning badges so an
 * operator immediately sees when a figure is cached, pending validation,
 * stale, or offline-derived. These are CAVEATS, not errors — they explain why
 * a value might not be live-authoritative without blocking action.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "../../hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "../../theme/themeTokens";
import type { StaleStateReason } from "../../viewModels/types";

const REASON_META: Record<StaleStateReason, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
    cached_erp: { label: "Cached ERP", icon: "cloud-offline-outline" },
    pending_sql_validation: { label: "Awaiting SQL", icon: "hourglass-outline" },
    stale_projection: { label: "May be stale", icon: "time-outline" },
    offline: { label: "Offline", icon: "wifi-outline" },
    baseline_missing: { label: "No baseline", icon: "help-circle-outline" },
};

export interface StaleStateBadgeProps {
    reasons: StaleStateReason[];
}

export const StaleStateBadge: React.FC<StaleStateBadgeProps> = ({ reasons }) => {
    const t = useUiTokens();
    const styles = makeStyles(t);

    const visible = reasons.filter((r) => REASON_META[r]);
    if (!visible.length) return null;

    return (
        <View style={styles.row} accessibilityRole="text">
            {visible.map((reason) => {
                const meta = REASON_META[reason];
                return (
                    <View
                        key={reason}
                        style={[styles.badge, { backgroundColor: colorWithAlpha(t.colors.warning, 0.14), borderColor: colorWithAlpha(t.colors.warning, 0.3) }]}
                    >
                        <Ionicons name={meta.icon} size={11} color={t.colors.warning} />
                        <Text style={[styles.label, { color: t.colors.warning }]}>{meta.label}</Text>
                    </View>
                );
            })}
        </View>
    );
};

const makeStyles = (t: ThemeTokens) =>
    StyleSheet.create({
        row: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: t.spacing.xxs,
        },
        badge: {
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            paddingHorizontal: 7,
            paddingVertical: 3,
            borderRadius: 999,
            borderWidth: 1,
        },
        label: {
            fontSize: 10,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: 0.3,
        },
    });
