import { StyleSheet } from "react-native";

import { colorWithAlpha } from "@/theme/themeTokens";
import type { useUiTokens } from "@/hooks/useUiTokens";

type UiTokens = ReturnType<typeof useUiTokens>;

/**
 * Styles for the staff item-detail screen. Extracted from the component so the
 * screen file stays focused on behavior. Depends only on theme tokens.
 */
export function createItemDetailStyles(uiTokens: UiTokens) {
    return StyleSheet.create({
      loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: uiTokens.spacing.lg,
      },
      loadingText: {
        marginTop: uiTokens.spacing.sm,
        color: uiTokens.colors.textSecondary,
        fontSize: 14,
      },
      errorContainer: {
        flex: 1,
        justifyContent: "center",
        paddingHorizontal: uiTokens.spacing.lg,
        gap: uiTokens.spacing.md,
      },
      errorCard: {
        gap: uiTokens.spacing.sm,
      },
      errorTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: uiTokens.colors.textPrimary,
        textAlign: "center",
      },
      errorText: {
        fontSize: 14,
        color: uiTokens.colors.textSecondary,
        textAlign: "center",
      },
      keyboardView: {
        flex: 1,
      },
      // The ScrollView must claim the viewport height (flex: 1); RN defaults
      // flexShrink to 0, so without this it sizes to full content height,
      // overflows the column, and stops scrolling on iOS.
      scrollView: {
        flex: 1,
      },
      scrollContent: {
        paddingHorizontal: uiTokens.spacing.md,
        paddingTop: uiTokens.spacing.md,
        paddingBottom: uiTokens.spacing.xl,
        gap: uiTokens.spacing.md,
        flexGrow: 1,
      },
      heroCard: {
        borderWidth: 1,
        borderColor: colorWithAlpha(uiTokens.colors.accent, uiTokens.mode === "dark" ? 0.36 : 0.2),
        backgroundColor: uiTokens.colors.surfaceElevated,
      },
      heroTop: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: uiTokens.spacing.md,
      },
      heroIcon: {
        width: 56,
        height: 56,
        borderRadius: uiTokens.radius.md,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colorWithAlpha(
          uiTokens.colors.accent,
          uiTokens.mode === "dark" ? 0.24 : 0.1
        ),
      },
      heroCopy: {
        flex: 1,
        minWidth: 0,
      },
      heroEyebrow: {
        fontSize: 12,
        fontWeight: "800",
        color: uiTokens.colors.textSecondary,
        textTransform: "uppercase",
      },
      heroTitle: {
        color: uiTokens.colors.textPrimary,
        fontSize: 22,
        fontWeight: "800",
        lineHeight: 27,
        marginTop: uiTokens.spacing.xs,
      },
      heroCodeRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: uiTokens.spacing.xs,
        marginTop: uiTokens.spacing.sm,
      },
      heroPill: {
        alignItems: "center",
        borderColor: uiTokens.colors.border,
        borderRadius: uiTokens.radius.md,
        borderWidth: 1,
        flexDirection: "row",
        gap: uiTokens.spacing.xs,
        paddingHorizontal: uiTokens.spacing.sm,
        paddingVertical: uiTokens.spacing.xs,
        backgroundColor: uiTokens.colors.surface,
      },
      heroPillStrong: {
        borderColor: colorWithAlpha(uiTokens.colors.accent, 0.36),
        backgroundColor: colorWithAlpha(
          uiTokens.colors.accent,
          uiTokens.mode === "dark" ? 0.16 : 0.08
        ),
      },
      heroPillText: {
        color: uiTokens.colors.textSecondary,
        fontSize: 12,
        fontWeight: "700",
      },
      heroPillTextStrong: {
        color: uiTokens.colors.accentStrong,
      },
      sourcePill: {
        alignSelf: "flex-start",
        borderRadius: uiTokens.radius.md,
        borderWidth: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: uiTokens.spacing.xs,
        paddingHorizontal: uiTokens.spacing.sm,
        paddingVertical: uiTokens.spacing.xs,
      },
      sourcePillText: {
        fontSize: 11,
        fontWeight: "800",
        textTransform: "uppercase",
      },
      heroMetrics: {
        borderTopWidth: 1,
        borderTopColor: uiTokens.colors.border,
        flexDirection: "row",
        gap: uiTokens.spacing.sm,
        marginTop: uiTokens.spacing.md,
        paddingTop: uiTokens.spacing.md,
      },
      heroMetricTile: {
        flex: 1,
        borderWidth: 1,
        borderColor: uiTokens.colors.border,
        borderRadius: uiTokens.radius.md,
        backgroundColor: uiTokens.colors.surface,
        paddingHorizontal: uiTokens.spacing.xs,
        paddingVertical: uiTokens.spacing.sm,
      },
      heroMetricLabel: {
        color: uiTokens.colors.textSecondary,
        fontSize: 11,
        fontWeight: "700",
        textTransform: "uppercase",
      },
      heroMetricValue: {
        color: uiTokens.colors.textPrimary,
        fontSize: 16,
        fontWeight: "800",
        marginTop: 2,
      },
      heroContextChips: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: uiTokens.spacing.xs,
        marginTop: uiTokens.spacing.md,
      },
      heroContextChip: {
        alignItems: "center",
        borderRadius: uiTokens.radius.md,
        borderWidth: 1,
        borderColor: uiTokens.colors.border,
        flexDirection: "row",
        gap: uiTokens.spacing.xs,
        backgroundColor: uiTokens.colors.surface,
        paddingHorizontal: uiTokens.spacing.sm,
        paddingVertical: uiTokens.spacing.xs,
      },
      heroContextChipText: {
        fontSize: 12,
        color: uiTokens.colors.textSecondary,
        fontWeight: "700",
      },
      workflowStrip: {
        flexDirection: "row",
        gap: uiTokens.spacing.xs,
        marginTop: uiTokens.spacing.md,
      },
      workflowStep: {
        flex: 1,
        borderRadius: uiTokens.radius.md,
        borderWidth: 1,
        borderColor: colorWithAlpha(uiTokens.colors.accent, 0.24),
        backgroundColor: colorWithAlpha(
          uiTokens.colors.accent,
          uiTokens.mode === "dark" ? 0.12 : 0.06
        ),
        paddingHorizontal: uiTokens.spacing.xs,
        paddingVertical: uiTokens.spacing.sm,
      },
      workflowStepIcon: {
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        borderRadius: uiTokens.radius.full,
        backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.16),
        marginBottom: uiTokens.spacing.xs,
      },
      workflowStepText: {
        color: uiTokens.colors.textPrimary,
        fontSize: 12,
        fontWeight: "800",
      },
      workflowStepMeta: {
        color: uiTokens.colors.textSecondary,
        fontSize: 11,
        fontWeight: "600",
        marginTop: 2,
      },
      sectionHeading: {
        flexDirection: "row",
        alignItems: "center",
        gap: uiTokens.spacing.xs,
        marginTop: uiTokens.spacing.xs,
      },
      sectionHeadingText: {
        fontSize: 12,
        fontWeight: "700",
        color: uiTokens.colors.textSecondary,
        textTransform: "uppercase",
      },
      recountBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: uiTokens.spacing.xs,
        marginTop: uiTokens.spacing.sm,
        padding: uiTokens.spacing.sm,
        borderRadius: uiTokens.radius.sm,
        borderWidth: 1,
      },
      recountBannerText: {
        flex: 1,
        fontSize: 12,
        fontWeight: "600",
        lineHeight: 17,
      },
    });
}
