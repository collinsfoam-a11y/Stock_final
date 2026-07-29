import React from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { useAuthStore } from "@/store/authStore";
import { getRouteForRole, type UserRole } from "@/utils/roleNavigation";

import { semanticColors, colors } from "@/theme/unified";
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
        <View style={[styles.panel, styles.heroPanel]}>
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

        <View style={[styles.panel, styles.actionPanel]}>
          <Text style={styles.actionTitle}>Start a session</Text>
          <Text style={styles.actionCopy}>
            {publicRegistrationEnabled
              ? "Sign in for operational access or create a new account for setup and onboarding."
              : "Sign in with the account assigned by your administrator."}
          </Text>

          <Pressable
            onPress={() => router.push("/login")}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          >
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </Pressable>

          {publicRegistrationEnabled ? (
            <Pressable
              onPress={() => router.push("/register")}
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
    padding: 24,
    justifyContent: "center",
  },
  shell: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    gap: 20,
  },
  shellWide: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  panel: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: semanticColors.border.default,
    backgroundColor: semanticColors.background.primary,
    padding: 28,
    boxShadow: "0px 16px 40px rgba(15, 23, 42, 0.08)",
  },
  heroPanel: {
    justifyContent: "space-between",
    minHeight: 360,
  },
  actionPanel: {
    maxWidth: 420,
    justifyContent: "center",
  },
  kicker: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
    color: colors.secondary[700],
    marginBottom: 14,
  },
  title: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "700",
    color: semanticColors.text.primary,
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: semanticColors.text.secondary,
    marginBottom: 28,
    maxWidth: 520,
  },
  featureList: {
    gap: 14,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
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
    color: semanticColors.text.primary,
  },
  actionTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: semanticColors.text.primary,
    marginBottom: 10,
  },
  actionCopy: {
    fontSize: 15,
    lineHeight: 22,
    color: semanticColors.text.secondary,
    marginBottom: 28,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.secondary[700],
    marginBottom: 12,
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
    minHeight: 52,
    borderRadius: 14,
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
    marginTop: 22,
    fontSize: 12,
    color: semanticColors.text.tertiary,
  },
});
