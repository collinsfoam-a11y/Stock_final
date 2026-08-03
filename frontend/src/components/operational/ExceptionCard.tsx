/**
 * ExceptionCard — typed exception surface (P0C / OXS Part E).
 *
 * Renders an {@link ExceptionViewModel} produced by the exception adapter. The
 * card is severity-coloured and exposes an optional primary action whose
 * `journey` is a stable, machine-readable target — the parent screen decides
 * how to route (the card never navigates directly, keeping it presentational
 * and testable).
 *
 * Authority boundary: the card only displays adapter-mapped content. It never
 * parses backend message strings or infers severity.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "../../hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "../../theme/themeTokens";
import { AppTouchable } from "../ui/AppTouchable";
import type { ExceptionSeverity, ExceptionViewModel } from "../../viewModels/types";

interface SeverityStyle {
    color: string;
    bg: string;
    icon: keyof typeof Ionicons.glyphMap;
}

const useSeverityStyle = (severity: ExceptionSeverity, t: ThemeTokens): SeverityStyle => {
    switch (severity) {
        case "blocking":
            return { color: t.colors.error, bg: colorWithAlpha(t.colors.error, 0.12), icon: "ban-outline" };
        case "warning":
            return { color: t.colors.warning, bg: colorWithAlpha(t.colors.warning, 0.12), icon: "alert-circle-outline" };
        default:
            return { color: t.colors.accent, bg: colorWithAlpha(t.colors.accent, 0.12), icon: "information-circle-outline" };
    }
};

export interface ExceptionCardProps {
    vm: ExceptionViewModel;
    /** Invoked when the user taps the suggested action. Receives the full VM. */
    onAction?: (vm: ExceptionViewModel) => void;
}

export const ExceptionCard: React.FC<ExceptionCardProps> = ({ vm, onAction }) => {
    const t = useUiTokens();
    const styles = makeStyles(t);
    const sev = useSeverityStyle(vm.severity, t);

    return (
        <View
            style={[styles.root, { backgroundColor: sev.bg, borderColor: colorWithAlpha(sev.color, 0.3) }]}
            accessibilityRole="alert"
            accessibilityLabel={`${vm.severity === "blocking" ? "Blocking" : vm.severity} exception: ${vm.title}. ${vm.description}`}
        >
            <View style={styles.headerRow}>
                <Ionicons name={sev.icon} size={20} color={sev.color} />
                <Text style={[styles.title, { color: t.colors.textPrimary }]} numberOfLines={2}>
                    {vm.title}
                </Text>
            </View>
            <Text style={styles.description}>{vm.description}</Text>
            {vm.action && onAction ? (
                <AppTouchable
                    onPress={() => onAction(vm)}
                    style={[styles.actionBtn, { borderColor: sev.color }]}
                    accessibilityRole="button"
                    accessibilityLabel={vm.action.label}
                >
                    <Text style={[styles.actionLabel, { color: sev.color }]}>{vm.action.label}</Text>
                    <Ionicons name="chevron-forward" size={14} color={sev.color} />
                </AppTouchable>
            ) : null}
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
        },
        headerRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: t.spacing.xs,
        },
        title: {
            flex: 1,
            fontSize: 15,
            fontWeight: "700",
        },
        description: {
            fontSize: 13,
            color: t.colors.textSecondary,
            lineHeight: 18,
        },
        actionBtn: {
            flexDirection: "row",
            alignItems: "center",
            gap: t.spacing.xxs,
            alignSelf: "flex-start",
            paddingVertical: t.spacing.xs,
            paddingHorizontal: t.spacing.sm,
            borderRadius: t.radius.full,
            borderWidth: 1,
            marginTop: t.spacing.xxs,
        },
        actionLabel: {
            fontSize: 13,
            fontWeight: "700",
        },
    });
