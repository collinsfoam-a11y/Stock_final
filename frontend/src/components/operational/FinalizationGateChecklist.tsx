/**
 * FinalizationGateChecklist — backend-driven finalization gate (P0C / OXS Part F).
 *
 * Renders a {@link FinalizationGateViewModel}. The `allowed` flag is read
 * verbatim from the backend finalization assessment — the frontend NEVER
 * computes finalization eligibility (FI-01..08 / R9). When blocked, every
 * blocker is listed with its stable code + description so the operator knows
 * exactly what to resolve. The finalize CTA is disabled until the backend
 * says `allowed: true`.
 *
 * The concurrency token (`assessmentToken`) is forwarded to the caller on
 * submit so the backend can race-safely reject a stale finalization.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "../../hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "../../theme/themeTokens";
import { ModernButton } from "../ui/ModernButton";
import type { FinalizationGateViewModel } from "../../viewModels/types";

export interface FinalizationGateChecklistProps {
    vm: FinalizationGateViewModel;
    /** Called with the assessment token when the operator taps Finalize. */
    onFinalize?: (assessmentToken?: string) => void;
    /** True while the finalization request is in flight. */
    submitting?: boolean;
}

export const FinalizationGateChecklist: React.FC<FinalizationGateChecklistProps> = ({
    vm,
    onFinalize,
    submitting = false,
}) => {
    const t = useUiTokens();
    const styles = makeStyles(t);

    const ready = vm.allowed;
    const blockerCount = vm.blockers.length;

    return (
        <View style={styles.root} accessibilityRole="summary">
            {/* Status header */}
            <View
                style={[
                    styles.statusHeader,
                    {
                        backgroundColor: ready ? colorWithAlpha(t.colors.success, 0.12) : colorWithAlpha(t.colors.error, 0.1),
                        borderColor: colorWithAlpha(ready ? t.colors.success : t.colors.error, 0.3),
                    },
                ]}
            >
                <Ionicons
                    name={ready ? "checkmark-circle" : "lock-closed"}
                    size={20}
                    color={ready ? t.colors.success : t.colors.error}
                />
                <View style={styles.statusCopy}>
                    <Text style={[styles.statusTitle, { color: t.colors.textPrimary }]}>
                        {ready ? "Ready to finalise" : `${blockerCount} blocker${blockerCount === 1 ? "" : "s"} to resolve`}
                    </Text>
                    <Text style={styles.statusSub}>FI-01..FI-08 / R9.1..R9.9</Text>
                    {vm.assessedAt ? (
                        <Text style={styles.statusSub}>Assessed {new Date(vm.assessedAt).toLocaleString()}</Text>
                    ) : null}
                </View>
            </View>

            {/* Blocker list */}
            {!ready && blockerCount > 0 ? (
                <View style={styles.blockerList}>
                    {vm.blockers.map((b, i) => (
                        <View
                            key={`${b.code}-${i}`}
                            style={[styles.blockerRow, { borderColor: t.colors.border }]}
                            accessibilityRole="text"
                            accessibilityLabel={`Blocker ${b.code}: ${b.description}`}
                        >
                            <Ionicons name="alert-circle" size={16} color={t.colors.error} />
                            <View style={styles.blockerCopy}>
                                <View style={styles.blockerCodeRow}>
                                    {b.canonicalCode ? (
                                        <Text style={styles.blockerCanonicalCode}>{b.canonicalCode}</Text>
                                    ) : null}
                                    <Text style={styles.blockerCode}>{b.code}</Text>
                                </View>
                                <Text style={styles.blockerDesc}>{b.description}</Text>
                                {b.action ? <Text style={styles.blockerAction}>→ {b.action}</Text> : null}
                            </View>
                        </View>
                    ))}
                </View>
            ) : null}

            {/* Finalize CTA — disabled until backend says allowed */}
            <ModernButton
                title={ready ? "Finalise session" : "Resolve blockers to finalise"}
                onPress={() => onFinalize?.(vm.assessmentToken)}
                disabled={!ready || submitting}
                loading={submitting}
                variant={ready ? "primary" : "outline"}
                fullWidth
                icon={ready ? "checkmark-done" : undefined}
                accessibilityLabel={
                    ready ? "Finalise session" : "Finalise session is disabled until all blockers are resolved"
                }
                accessibilityHint={ready ? "Submits the session for finalisation." : undefined}
            />
        </View>
    );
};

const makeStyles = (t: ThemeTokens) =>
    StyleSheet.create({
        root: {
            gap: t.spacing.sm,
        },
        statusHeader: {
            flexDirection: "row",
            alignItems: "center",
            gap: t.spacing.sm,
            padding: t.spacing.sm + t.spacing.xs,
            borderRadius: t.radius.md,
            borderWidth: 1,
        },
        statusCopy: {
            flex: 1,
            gap: 2,
        },
        statusTitle: {
            fontSize: 15,
            fontWeight: "700",
        },
        statusSub: {
            fontSize: 11,
            color: t.colors.textMuted,
        },
        blockerList: {
            gap: t.spacing.xs,
        },
        blockerRow: {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: t.spacing.xs,
            padding: t.spacing.sm,
            borderRadius: t.radius.sm,
            borderWidth: 1,
            backgroundColor: t.colors.surface,
        },
        blockerCopy: {
            flex: 1,
            gap: 2,
        },
        blockerCode: {
            fontSize: 11,
            fontWeight: "800",
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: t.colors.error,
        },
        blockerCodeRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: t.spacing.xs,
        },
        blockerCanonicalCode: {
            fontSize: 10,
            fontWeight: "800",
            letterSpacing: 0.3,
            textTransform: "uppercase",
            color: t.colors.accent,
            backgroundColor: colorWithAlpha(t.colors.accent, 0.12),
            paddingHorizontal: 4,
            paddingVertical: 1,
            borderRadius: t.radius.full,
        },
        blockerDesc: {
            fontSize: 13,
            color: t.colors.textPrimary,
            lineHeight: 18,
        },
        blockerAction: {
            fontSize: 12,
            color: t.colors.accent,
            fontWeight: "600",
            marginTop: 2,
        },
    });
