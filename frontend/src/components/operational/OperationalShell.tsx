/**
 * OperationalShell — the "Guidance mode" layout primitive (P2 / OXS §6.2).
 *
 * Implements the glossary's "Guidance mode": one decision per screen, a FIXED
 * context header (session · location · sync state), and a single primary CTA
 * pinned in a sticky bottom action bar that never scrolls away.
 *
 * Governance compliance:
 * - §6.2 Rack identity visible above the active counting area.
 * - §6.7 Frequent actions in the lower reachable area (thumb-zone CTA).
 * - §5.3 The bar never scrolls away — the thumb always knows where "confirm" lives.
 *
 * This shell is presentational only — it does not recompute domain truth. The
 * primary action's enabled/loading state is owned by the caller (adapter-mapped).
 */

import React from "react";
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    RefreshControl,
    type ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useUiTokens } from "../../hooks/useUiTokens";
import { getTokenShadowStyle, type ThemeTokens } from "../../theme/themeTokens";
import { ModernButton } from "../ui/ModernButton";

export interface OperationalPrimaryAction {
    /** Visible label for the primary CTA (e.g. "Finish Rack", "Save & Next"). */
    label: string;
    onPress: () => void;
    /** Optional leading icon. */
    icon?: keyof typeof Ionicons.glyphMap;
    loading?: boolean;
    disabled?: boolean;
    testID?: string;
    accessibilityHint?: string;
}

export interface OperationalShellProps {
    /** Primary context line, e.g. "Floor 1 • Rack A12". */
    contextLabel: string;
    /** Secondary context line, e.g. session name or operator. */
    contextSublabel?: string;
    /** The single primary action rendered in the sticky bottom bar. */
    primaryAction: OperationalPrimaryAction;
    /** Optional node pinned to the header right (sync pill, logout, etc.). */
    headerRight?: React.ReactNode;
    children: React.ReactNode;
    /** Pull-to-refresh wiring (optional). */
    refreshing?: boolean;
    onRefresh?: () => void;
    /** Extra style for the scrollable content container. */
    contentContainerStyle?: ViewStyle;
    /** When true, the header gets a success-tinted "live" dot (session active). */
    live?: boolean;
}

export const OperationalShell: React.FC<OperationalShellProps> = ({
    contextLabel,
    contextSublabel,
    primaryAction,
    headerRight,
    children,
    refreshing,
    onRefresh,
    contentContainerStyle,
    live = true,
}) => {
    const t = useUiTokens();
    const styles = makeStyles(t);
    const insets = useSafeAreaInsets();

    return (
        <SafeAreaView
            style={[styles.root, { backgroundColor: t.colors.background }]}
            edges={["top"]}
        >
            {/* Fixed context header — never scrolls (§6.2). */}
            <View
                style={[
                    styles.contextHeader,
                    {
                        backgroundColor: t.colors.surface,
                        borderBottomColor: t.colors.border,
                    },
                ]}
                accessibilityRole="header"
            >
                <View style={styles.contextMeta}>
                    <View style={styles.contextLabelRow}>
                        <View
                            style={[
                                styles.liveDot,
                                {
                                    backgroundColor: live ? t.colors.success : t.colors.textMuted,
                                },
                            ]}
                        />
                        <Text
                            style={[styles.contextLabel, { color: t.colors.textPrimary }]}
                            numberOfLines={1}
                        >
                            {contextLabel}
                        </Text>
                    </View>
                    {contextSublabel ? (
                        <Text
                            style={[styles.contextSublabel, { color: t.colors.textSecondary }]}
                            numberOfLines={1}
                        >
                            {contextSublabel}
                        </Text>
                    ) : null}
                </View>
                {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
            </View>

            {/* Scrollable content area. */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                refreshControl={
                    onRefresh ? (
                        <RefreshControl
                            refreshing={!!refreshing}
                            onRefresh={onRefresh}
                            tintColor={t.colors.accent}
                            colors={[t.colors.accent]}
                        />
                    ) : undefined
                }
            >
                {children}
                {/* Spacer so content clears the sticky bottom bar. */}
                <View style={{ height: insets.bottom + 96 }} />
            </ScrollView>

            {/* Sticky bottom action bar — never scrolls away (§5.3 / §6.7). */}
            <View
                style={[
                    styles.actionBar,
                    {
                        backgroundColor: t.colors.surface,
                        borderTopColor: t.colors.border,
                        paddingBottom: insets.bottom + t.spacing.sm,
                    },
                    getTokenShadowStyle(t, "sm"),
                ]}
            >
                <ModernButton
                    title={primaryAction.label}
                    onPress={primaryAction.onPress}
                    variant="primary"
                    icon={primaryAction.icon}
                    iconPosition="left"
                    loading={primaryAction.loading}
                    disabled={primaryAction.disabled}
                    fullWidth
                    testID={primaryAction.testID}
                    accessibilityHint={primaryAction.accessibilityHint}
                />
            </View>
        </SafeAreaView>
    );
};

const makeStyles = (t: ThemeTokens) =>
    StyleSheet.create({
        root: {
            flex: 1,
        },
        contextHeader: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: t.spacing.sm,
            paddingHorizontal: t.spacing.md,
            paddingVertical: t.spacing.sm,
            borderBottomWidth: 1,
        },
        contextMeta: {
            flex: 1,
            gap: 2,
        },
        contextLabelRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: t.spacing.xs,
        },
        liveDot: {
            width: 8,
            height: 8,
            borderRadius: 4,
        },
        contextLabel: {
            fontSize: 15,
            fontWeight: "700",
        },
        contextSublabel: {
            fontSize: 12,
        },
        headerRight: {
            flexDirection: "row",
            alignItems: "center",
            gap: t.spacing.xs,
        },
        scroll: {
            flex: 1,
        },
        scrollContent: {
            paddingHorizontal: t.spacing.md,
            paddingVertical: t.spacing.sm,
        },
        actionBar: {
            borderTopWidth: 1,
            paddingHorizontal: t.spacing.md,
            paddingTop: t.spacing.sm,
        },
    });
