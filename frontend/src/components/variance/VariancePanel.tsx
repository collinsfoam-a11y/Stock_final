/**
 * VariancePanel — canonical reconciliation display (P0B).
 *
 * Presentational component that renders a {@link VarianceViewModel}. It NEVER
 * recomputes authoritative quantities — every number shown is read verbatim
 * from the view model (which itself only maps backend-provided values).
 *
 * Authority boundary (OXS Part I / proposal §14.1–14.4):
 *  - Reference quantities (baseline, movement-adjusted, current ERP, physical)
 *    are shown with their backend provenance.
 *  - Canonical deltas (quantity/audit/operational) and shortage/excess are
 *    displayed as-is; absence (null) is rendered as "—", never coerced to 0.
 *  - Severity colouring is a display concern only; it does not gate actions.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "../../hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "../../theme/themeTokens";
import type {
    AbsenceReason,
    OptionalNumber,
    SourcedQuantity,
    VarianceClassification,
    VarianceSeverity,
    VarianceViewModel,
} from "../../viewModels/types";

// ---------------------------------------------------------------------------
// Display helpers (formatting only — no recomputation)
// ---------------------------------------------------------------------------

/** Formats a delta with an explicit sign, or "—" when absent. */
const formatDelta = (n: OptionalNumber): string => {
    if (n === null || n === undefined) return "—";
    if (n > 0) return `+${n}`;
    return `${n}`;
};

/** Formats a plain quantity, or "—" when absent. Zero is shown as "0". */
const formatQty = (n: OptionalNumber): string => {
    if (n === null || n === undefined) return "—";
    return `${n}`;
};

const ABSENCE_LABEL: Record<AbsenceReason, string> = {
    unavailable: "Unavailable",
    pending: "Pending",
    pending_sql_validation: "Awaiting SQL validation",
    stale: "Stale",
    not_applicable: "N/A",
};

/** Human caption for a sourced quantity's provenance + absence state. */
const provenanceCaption = (q: SourcedQuantity): string => {
    if (q.value === null || q.value === undefined) {
        return q.absence ? ABSENCE_LABEL[q.absence] : "Unavailable";
    }
    const parts: string[] = [];
    if (q.source) parts.push(q.source);
    if (q.isCachedErp) parts.push("cached");
    return parts.join(" · ") || "—";
};

const CLASSIFICATION_LABEL: Record<VarianceClassification, string> = {
    MATCH: "Match",
    ERP_MOVEMENT: "ERP movement",
    REAL_VARIANCE: "Real variance",
    RELOCATION: "Relocation",
};

// ---------------------------------------------------------------------------
// Severity theming
// ---------------------------------------------------------------------------

interface SeverityTheme {
    color: string;
    bg: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
}

const useSeverityTheme = (
    severity: VarianceSeverity,
    t: ThemeTokens,
): SeverityTheme => {
    switch (severity) {
        case "critical":
            return {
                color: t.colors.error,
                bg: colorWithAlpha(t.colors.error, 0.12),
                icon: "warning",
                label: "Critical",
            };
        case "warning":
            return {
                color: t.colors.warning,
                bg: colorWithAlpha(t.colors.warning, 0.12),
                icon: "alert-circle-outline",
                label: "Warning",
            };
        default:
            return {
                color: t.colors.success,
                bg: colorWithAlpha(t.colors.success, 0.12),
                icon: "checkmark-circle-outline",
                label: "OK",
            };
    }
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface QuantityCellProps {
    label: string;
    qty: SourcedQuantity;
    emphasize?: boolean;
}

const QuantityCell: React.FC<QuantityCellProps> = ({ label, qty, emphasize }) => {
    const t = useUiTokens();
    const isAbsent = qty.value === null || qty.value === undefined;
    const styles = makeStyles(t);

    return (
        <View
            style={styles.cell}
            accessibilityRole="text"
            accessibilityLabel={`${label}: ${isAbsent ? "not available" : formatQty(qty.value)}. ${provenanceCaption(qty)}`}
        >
            <Text style={styles.cellLabel}>{label}</Text>
            <Text style={[styles.cellValue, emphasize && styles.cellValueEmphasized, isAbsent && styles.cellValueAbsent]}>
                {formatQty(qty.value)}
            </Text>
            <View style={styles.cellCaptionRow}>
                {qty.isCachedErp && (
                    <View style={[styles.cachedBadge, { backgroundColor: colorWithAlpha(t.colors.warning, 0.16) }]}>
                        <Text style={[styles.cachedBadgeText, { color: t.colors.warning }]}>cached</Text>
                    </View>
                )}
                <Text style={styles.cellCaption} numberOfLines={2}>
                    {provenanceCaption(qty)}
                </Text>
            </View>
        </View>
    );
};

interface DeltaCellProps {
    label: string;
    value: OptionalNumber;
}

const DeltaCell: React.FC<DeltaCellProps> = ({ label, value }) => {
    const t = useUiTokens();
    const styles = makeStyles(t);
    const isAbsent = value === null || value === undefined;

    const tone =
        value === null || value === undefined
            ? t.colors.textMuted
            : value > 0
                ? t.colors.error
                : value < 0
                    ? t.colors.warning
                    : t.colors.success;

    return (
        <View style={styles.cell} accessibilityRole="text" accessibilityLabel={`${label}: ${formatDelta(value)}`}>
            <Text style={styles.cellLabel}>{label}</Text>
            <Text style={[styles.deltaValue, { color: tone }, isAbsent && styles.cellValueAbsent]}>
                {formatDelta(value)}
            </Text>
        </View>
    );
};

// ---------------------------------------------------------------------------
// VariancePanel
// ---------------------------------------------------------------------------

export interface VariancePanelProps {
    vm: VarianceViewModel;
    /** Optional header label rendered above the item identity. */
    title?: string;
}

export const VariancePanel: React.FC<VariancePanelProps> = ({ vm, title }) => {
    const t = useUiTokens();
    const styles = makeStyles(t);
    const sev = useSeverityTheme(vm.severity, t);

    const locationParts = [vm.location?.floor, vm.location?.rack, vm.location?.warehouse].filter(
        Boolean,
    ) as string[];

    return (
        <View
            style={styles.root}
            accessibilityRole="summary"
            accessibilityLabel={`Variance for ${vm.itemName}. ${CLASSIFICATION_LABEL[vm.classification]}, ${sev.label}.`}
        >
            {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}

            {/* Item identity */}
            <View style={styles.identityRow}>
                <View style={[styles.identityIcon, { backgroundColor: colorWithAlpha(t.colors.accent, 0.1) }]}>
                    <Ionicons name="cube-outline" size={22} color={t.colors.accent} />
                </View>
                <View style={styles.identityMeta}>
                    <Text style={styles.itemName} numberOfLines={2}>
                        {vm.itemName}
                    </Text>
                    <Text style={styles.itemCode}>{vm.itemCode}</Text>
                    {locationParts.length > 0 ? (
                        <Text style={styles.locationText}>{locationParts.join(" · ")}</Text>
                    ) : null}
                </View>
            </View>

            {/* Severity / classification banner */}
            <View style={[styles.banner, { backgroundColor: sev.bg, borderColor: colorWithAlpha(sev.color, 0.3) }]}>
                <Ionicons name={sev.icon} size={18} color={sev.color} />
                <View style={styles.bannerCopy}>
                    <Text style={[styles.bannerLabel, { color: sev.color }]}>
                        {CLASSIFICATION_LABEL[vm.classification]} · {sev.label}
                    </Text>
                    <Text style={styles.bannerExplanation}>{vm.explanation}</Text>
                </View>
            </View>

            {/* PENDING_SQL_VALIDATION — live SQL is pending; ERP figure is cached */}
            {vm.currentErp.absence === "pending_sql_validation" ? (
                <View style={[styles.pendingBanner, { backgroundColor: colorWithAlpha(t.colors.warning, 0.12), borderColor: colorWithAlpha(t.colors.warning, 0.3) }]}>
                    <Ionicons name="alert-circle-outline" size={16} color={t.colors.warning} />
                    <Text style={[styles.pendingText, { color: t.colors.warning }]}>
                        Awaiting SQL validation — physical count saved; ERP figure pending live verification
                    </Text>
                </View>
            ) : null}

            {/* Reference quantities (with provenance) */}
            <Text style={styles.groupLabel}>Reference quantities</Text>
            <View style={styles.grid}>
                <QuantityCell label="Baseline" qty={vm.baseline} />
                <QuantityCell label="Movement-adjusted" qty={vm.movementAdjustedExpected} />
                <QuantityCell label="Current ERP" qty={vm.currentErp} />
                <QuantityCell label="Physical count" qty={vm.physical} emphasize />
            </View>

            {/* Canonical deltas */}
            <Text style={styles.groupLabel}>Variance</Text>
            <View style={styles.grid}>
                <DeltaCell label="Quantity Δ" value={vm.quantityDelta} />
                <DeltaCell label="Audit Δ" value={vm.auditDelta} />
                <DeltaCell label="Operational Δ" value={vm.operationalDelta} />
                <DeltaCell label="Shortage" value={vm.shortageQty} />
                <DeltaCell label="Excess" value={vm.excessQty} />
            </View>
        </View>
    );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const makeStyles = (t: ThemeTokens): ReturnType<typeof StyleSheet.create> =>
    StyleSheet.create({
        root: {
            gap: t.spacing.sm,
        },
        sectionTitle: {
            fontSize: 13,
            fontWeight: "700",
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: t.colors.textSecondary,
        },
        identityRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: t.spacing.sm,
        },
        identityIcon: {
            width: 40,
            height: 40,
            borderRadius: t.radius.md,
            alignItems: "center",
            justifyContent: "center",
        },
        identityMeta: {
            flex: 1,
            gap: 2,
        },
        itemName: {
            fontSize: 16,
            fontWeight: "700",
            color: t.colors.textPrimary,
        },
        itemCode: {
            fontSize: 12,
            color: t.colors.textSecondary,
        },
        locationText: {
            fontSize: 11,
            color: t.colors.textMuted,
        },
        banner: {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: t.spacing.sm,
            padding: t.spacing.sm + t.spacing.xs,
            borderRadius: t.radius.md,
            borderWidth: 1,
        },
        bannerCopy: {
            flex: 1,
            gap: 2,
        },
        bannerLabel: {
            fontSize: 13,
            fontWeight: "700",
        },
        bannerExplanation: {
            fontSize: 12,
            color: t.colors.textSecondary,
            lineHeight: 16,
        },
        groupLabel: {
            fontSize: 12,
            fontWeight: "700",
            letterSpacing: 0.3,
            textTransform: "uppercase",
            color: t.colors.textMuted,
            marginTop: t.spacing.xs,
        },
        grid: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: t.spacing.xs,
        },
        cell: {
            flexGrow: 1,
            flexBasis: "44%",
            padding: t.spacing.sm,
            borderRadius: t.radius.md,
            borderWidth: 1,
            borderColor: t.colors.border,
            backgroundColor: t.colors.surface,
            gap: 2,
        },
        cellLabel: {
            fontSize: 11,
            fontWeight: "600",
            color: t.colors.textSecondary,
        },
        cellValue: {
            fontSize: 20,
            fontWeight: "700",
            color: t.colors.textPrimary,
        },
        cellValueEmphasized: {
            fontSize: 24,
        },
        cellValueAbsent: {
            color: t.colors.textMuted,
            fontWeight: "500",
        },
        deltaValue: {
            fontSize: 22,
            fontWeight: "800",
        },
        cellCaptionRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: t.spacing.xxs,
            marginTop: 2,
        },
        cachedBadge: {
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderRadius: t.radius.full,
        },
        cachedBadgeText: {
            fontSize: 9,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: 0.3,
        },
        cellCaption: {
            flex: 1,
            fontSize: 10,
            color: t.colors.textMuted,
        },
        pendingBanner: {
            flexDirection: "row",
            alignItems: "center",
            gap: t.spacing.xs,
            padding: t.spacing.sm + t.spacing.xs,
            borderRadius: t.radius.md,
            borderWidth: 1,
        },
        pendingText: {
            fontSize: 12,
            fontWeight: "600",
            flex: 1,
        },
    });
