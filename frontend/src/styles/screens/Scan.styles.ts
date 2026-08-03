import { Platform, StyleSheet } from "react-native";

import { colors, spacing, typography, borderRadius } from "@/theme/unified";
import { zIndex } from "@/theme/designTokens";

/**
 * Styles for the staff scan screen. Extracted from the component so the screen
 * file stays focused on behavior. Theme palette colors come from legacyCompat;
 * live theme colors are still applied inline at the call site via tokens.
 */
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[50],
  },
  scrollContent: {
    padding: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: 100,
  },
  scanExceptionWrapper: {
    marginBottom: spacing.sm,
  },
  footerSpacer: {
    height: 20,
  },
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: Platform.OS === "ios" ? 34 : spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusRow: {
    alignItems: "flex-end",
    marginBottom: spacing.sm,
  },
  logoutButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: zIndex.overlay,
  },
  pointerEventsNone: {
    pointerEvents: "none",
  },
  performanceOverlay: {
    position: "absolute",
    top: 60,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    zIndex: zIndex.tooltip,
  },
  performanceText: {
    color: colors.white,
    fontSize: typography.fontSize.xs,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  performanceGood: {
    backgroundColor: "rgba(34,197,94,0.8)",
  },
  performancePoor: {
    backgroundColor: "rgba(239,68,68,0.8)",
  },
  missingSessionContainer: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: "center",
  },
  missingSessionCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  missingSessionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.neutral[900],
    textAlign: "center",
  },
  missingSessionBody: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[600],
    textAlign: "center",
    lineHeight: 22,
  },
  missingSessionActions: {
    width: "100%",
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
});
