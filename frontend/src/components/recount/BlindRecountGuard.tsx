/**
 * BlindRecountGuard — distinct-user blind-recount notice (P0D / OXS Part D).
 *
 * A blind recount requires a DIFFERENT person than the original counter
 * (AR-* / glossary "Blind recount"). The backend enforces this with a 403;
 * this component surfaces the reason clearly in the UI so the operator
 * understands why they cannot perform the recount, rather than discovering
 * it only on submit.
 *
 * Authority boundary: the guard only displays the pre-computed
 * `currentUserIsOriginalCounter` flag from the view model. It never decides
 * eligibility itself.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "../../hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "../../theme/themeTokens";

export interface BlindRecountGuardProps {
    /** True when the current user performed the original count. */
    blocked: boolean;
    /** Optional name of an alternate assignee to suggest. */
    suggestedAssignee?: string;
}

export const BlindRecountGuard: React.FC<BlindRecountGuardProps> = ({ blocked, suggestedAssignee }) => {
    const t = useUiTokens();
    const styles = makeStyles(t);

    if (!blocked) return null;

    return (
        <View
            style={[styles.root, { backgroundColor: colorWithAlpha(t.colors.error, 0.1), borderColor: colorWithAlpha(t.colors.error, 0.3) }]}
            accessibilityRole="alert"
            accessibilityLabel="You cannot perform this blind recount because you completed the original count. A different person is required."
        >
            <Ionicons name="person-remove-outline" size={20} color={t.colors.error} />
            <View style={styles.copy}>
                <Text style={[styles.title, { color: t.colors.textPrimary }]}>You can't perform this recount</Text>
                <Text style={styles.body}>
                    Blind recounts must be done by a different person than the original counter.{" "}
                    {suggestedAssignee ? `Please reassign to ${suggestedAssignee} or another staff member.` : "Please ask another staff member to complete it."}
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
            padding: t.spacing.md,
            borderRadius: t.radius.md,
            borderWidth: 1,
        },
        copy: {
            flex: 1,
            gap: 2,
        },
        title: {
            fontSize: 14,
            fontWeight: "700",
        },
        body: {
            fontSize: 12,
            color: t.colors.textSecondary,
            lineHeight: 16,
        },
    });
