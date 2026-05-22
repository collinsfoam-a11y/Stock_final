import React from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { useAuthStore } from "@/store/authStore";
import { getRouteForRole, type UserRole } from "@/utils/roleNavigation";

import { semanticColors, colors, spacing, radius, touchTargets } from "@/theme/legacyCompat";
import { getFlag } from "@/constants/flags";

const FEATURE_ITEMS = [
  "Offline-first stock counts",
  "Role-based supervisor routing",
  "Live sync and recovery safeguards",
] as const;

function WelcomeScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const publicRegistrationEnabled = getFlag("enablePublicRegistration");

  React.useEffect(() => {
    if (!isLoading && user) {
      const target = getRouteForRole(user.role as UserRole);
      router.replace(target as any);
    }
  }, [isLoading, router, user]);

  return (
    <View style={styles.page}>
      <StatusBar style="dark" />
      <View style={[styles.shell, isWide && styles.shellWide]}>
        <View style={[styles.panel, styles.heroPanel, isWide && styles.shellWideHeroPanel]}>
          <Text style={styles.kicker}>Lavanya Mart</Text>
          <Text style={styles.title}>Stock Verification</Text>
          <Text style={styles.subtitle}>
            Secure counting workflows for field teams, supervisors, and admin review.
          </Text>
          <View style={styles.featureList}>
            {FEATURE_ITEMS.map((item) => (
              <View key={item} style={styles.featureItem}>
                <View style={styles.featureDot} />
                <Text style={styles.featureText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.panel, styles.actionPanel, isWide && styles.shellWideActionPanel]}>
          <Text style={styles.actionTitle}>Start a session</Text>
          <Text style={styles.actionCopy}>
            {publicRegistrationEnabled
              ? "Sign in for operational access or create a new account for setup and onboarding."
              : "Sign in with the account assigned by your administrator."}
          </Text>

          <Pressable
            onPress={() => router.push("/login")}
            accessibilityRole="button"
            accessibilityLabel="Sign in to Stock Verification"
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          >
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </Pressable>

          {publicRegistrationEnabled ? (
            <Pressable
              onPress={() => router.push("/register")}
              accessibilityRole="button"
              accessibilityLabel="Create a Stock Verification account"
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Create Account</Text>
            </Pressable>
          ) : null}

          <Text style={styles.footer}>Lavanya Mart 2026</Text>
        </View>
      </View>
    </View>
  );
}

export { WelcomeScreen };
export default WelcomeScreen;

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: semanticColors.background.secondary,
    padding: spacing.xl,
    justifyContent: "flex-start",
  },
  shell: {
    width: "100%",
    maxWidth: 1040,
    alignSelf: "center",
    gap: spacing.lg,
  },
  shellWide: {
    flexDirection: "row",
    alignItems: "center",
  },
  panel: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semanticColors.border.default,
    backgroundColor: semanticColors.background.primary,
    padding: spacing["2xl"],
    boxShadow: "0px 8px 24px rgba(15, 23, 42, 0.08)",
  },
  heroPanel: {
    justifyContent: "flex-start",
    gap: spacing.md,
  },
  shellWideHeroPanel: {
    flex: 1,
  },
  actionPanel: {
    maxWidth: 420,
    alignSelf: "center",
    justifyContent: "flex-start",
    width: "100%",
  },
  shellWideActionPanel: {
    alignSelf: "stretch",
    flexBasis: 420,
    flexGrow: 0,
    flexShrink: 0,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
    color: colors.secondary[700],
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "700",
    color: semanticColors.text.primary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: semanticColors.text.secondary,
    maxWidth: 520,
  },
  featureList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: touchTargets.minimum,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: semanticColors.background.secondary,
    borderWidth: 1,
    borderColor: semanticColors.border.default,
  },
  featureDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.secondary[700],
  },
  featureText: {
    fontSize: 15,
    lineHeight: 20,
    color: semanticColors.text.primary,
  },
  actionTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: semanticColors.text.primary,
    marginBottom: spacing.sm,
  },
  actionCopy: {
    fontSize: 15,
    lineHeight: 22,
    color: semanticColors.text.secondary,
    marginBottom: spacing.xl,
  },
  primaryButton: {
    minHeight: touchTargets.comfortable,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.secondary[700],
    marginBottom: spacing.md,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonText: {
    color: semanticColors.text.inverse,
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: touchTargets.comfortable,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: semanticColors.background.primary,
    borderWidth: 1,
    borderColor: semanticColors.border.strong,
  },
  secondaryButtonPressed: {
    backgroundColor: semanticColors.background.secondary,
  },
  secondaryButtonText: {
    color: semanticColors.text.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  footer: {
    marginTop: spacing.xl,
    fontSize: 12,
    color: semanticColors.text.tertiary,
  },
});
