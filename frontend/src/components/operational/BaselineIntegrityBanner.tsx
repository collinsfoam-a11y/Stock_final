/**
 * BaselineIntegrityBanner — frozen-snapshot reassurance (P0F / OXS Part I).
 *
 * Renders a {@link BaselineIntegrityViewModel}. The baseline is captured once
 * at session start and is IMMUTABLE — resuming a session never recaptures it
 * (the backend raises GovernanceViolation if attempted). This banner makes that
 * guarantee visible so the operator trusts the reference quantity won't shift.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "../../hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "../../theme/themeTokens";
import type { BaselineIntegrityViewModel } from "../../viewModels/types";

export interface BaselineIntegrityBannerProps {
    vm: BaselineIntegrityViewModel;
}

export const BaselineIntegrityBanner: React.FC<BaselineIntegrityBannerProps> = ({ vm }) => {
    const t = useUiTokens();
    const styles = makeStyles(t);

    const frozenLabel = vm.frozenAt ? new Date(vm.frozenAt).toLocaleString() : "at session start";

    return (
        <View
            style={[styles.root, { backgroundColor: colorWithAlpha(t.colors.success, 0.1), borderColor: colorWithAlpha(t.colors.success, 0.3) }]}
            accessibilityRole="summary"
            accessibilityLabel={`Baseline frozen ${frozenLabel}. Immutable — will not change on resume.`}
        >
            <Ionicons name="lock-closed" size={18} color={t.colors.success} />
            <View style={styles.copy}>
                <Text style={[styles.title, { color: t.colors.textPrimary }]}>
                    Baseline frozen {frozenLabel}
                </Text>
                <Text style={styles.body}>
                    {vm.source ? `${vm.source} · ` : ""}Immutable reference — resuming this session will never recapture it.
                </Text>
            </View>
        </View>
    );
};

const makeStyles = (t: ThemeTokens) =>
    StyleSheet.create({
        root: {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: t.spacing.sm,
            padding: t.spacing.sm + t.spacing.xs,
            borderRadius: t.radius.md,
            borderWidth: 1,
        },
        copy: {
            flex: 1,
            gap: 2,
        },
        title: {
            fontSize: 13,
            fontWeight: "700",
        },
        body: {
            fontSize: 12,
            color: t.colors.textSecondary,
            lineHeight: 16,
        },
    });
