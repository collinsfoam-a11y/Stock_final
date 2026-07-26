import React from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useAuthStore } from "@/store/authStore";
import { getRouteForRole, type UserRole } from "@/utils/roleNavigation";
import { BrandLogo } from "@/components/branding/BrandLogo";

import { semanticColors, colors } from "@/theme/legacyCompat";
import { getFlag } from "@/constants/flags";

const FEATURE_ITEMS: ReadonlyArray<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  copy: string;
}> = [
  {
    icon: "cloud-offline-outline",
    title: "Offline-first stock counts",
    copy: "Keep scanning even when the network drops — counts sync when you're back.",
  },
  {
    icon: "people-outline",
    title: "Role-based supervisor routing",
    copy: "Staff count, supervisors review variances, admins govern the process.",
  },
  {
    icon: "sync-outline",
    title: "Live sync and recovery safeguards",
    copy: "Idempotent writes and audit trails protect every counted quantity.",
  },
];

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
        <LinearGradient
          colors={[colors.secondary[900], colors.secondary[700], colors.secondary[500]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.panel, styles.heroPanel]}
        >
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}>
              <BrandLogo variant="symbol" width={34} height={34} />
            </View>
            <Text style={styles.kicker}>Lavanya Mart</Text>
          </View>
          <View>
            <Text style={styles.title}>Stock Verification</Text>
            <Text style={styles.subtitle}>
              Secure counting workflows for field teams, supervisors, and admin review.
            </Text>
          </View>
          <View style={styles.featureList}>
            {FEATURE_ITEMS.map((item) => (
              <View key={item.title} style={styles.featureItem}>
                <View style={styles.featureIconWrap}>
                  <Ionicons name={item.icon} size={20} color={colors.secondary[100]} />
                </View>
                <View style={styles.featureTextWrap}>
                  <Text style={styles.featureTitle}>{item.title}</Text>
                  <Text style={styles.featureCopy}>{item.copy}</Text>
                </View>
              </View>
            ))}
          </View>
        </LinearGradient>

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
            accessibilityRole="button"
            accessibilityLabel="Sign In"
            accessible
          >
            <Ionicons name="log-in-outline" size={20} color={semanticColors.text.inverse} />
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </Pressable>

          {publicRegistrationEnabled ? (
            <Pressable
              onPress={() => router.push("/register")}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Create Account"
              accessible
            >
              <Text style={styles.secondaryButtonText}>Create Account</Text>
            </Pressable>
          ) : null}

          <View style={styles.trustRow}>
            <Ionicons name="shield-checkmark-outline" size={14} color={semanticColors.text.tertiary} />
            <Text style={styles.footer}>Secure · Reliable · Lavanya Mart 2026</Text>
          </View>
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
    minHeight: 400,
    borderColor: "rgba(255, 255, 255, 0.12)",
    gap: 24,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brandBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.92)",
  },
  actionPanel: {
    maxWidth: 420,
    justifyContent: "center",
  },
  kicker: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.secondary[100],
  },
  title: {
    fontSize: 42,
    lineHeight: 48,
    fontWeight: "700",
    color: semanticColors.text.inverse,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: "rgba(235, 245, 255, 0.85)",
    maxWidth: 520,
  },
  featureList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  featureIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  featureTextWrap: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: semanticColors.text.inverse,
  },
  featureCopy: {
    fontSize: 13,
    lineHeight: 19,
    color: "rgba(235, 245, 255, 0.72)",
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
    flexDirection: "row",
    gap: 8,
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
  trustRow: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footer: {
    fontSize: 12,
    color: semanticColors.text.tertiary,
  },
});
