import React from "react";
import { StyleSheet, Text, useWindowDimensions, View, Platform, Alert } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";
import { getRouteForRole, type UserRole } from "@/utils/roleNavigation";
import { useUiTokens } from "@/hooks/useUiTokens";
import { getFlag } from "@/constants/flags";
import { AppTouchable } from "@/components/ui/AppTouchable";

const FEATURE_ITEMS = [
  { label: "Offline-first stock counts", icon: "cloud-done-outline" },
  { label: "Role-based supervisor routing", icon: "shield-checkmark-outline" },
  { label: "Live sync & recovery safeguards", icon: "sync-outline" },
] as const;

function WelcomeScreen() {
  const router = useRouter();
  const t = useUiTokens();
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const lastLoggedUser = useAuthStore((state) => state.lastLoggedUser);
  const authenticateWithBiometrics = useAuthStore((state) => state.authenticateWithBiometrics);
  const biometricAuthEnabled = useSettingsStore((state) => state.settings.biometricAuth);

  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const publicRegistrationEnabled = getFlag("enablePublicRegistration");

  React.useEffect(() => {
    if (!isLoading && user) {
      const target = getRouteForRole(user.role as UserRole);
      router.replace(target as any);
    }
  }, [isLoading, router, user]);

  const handleQuickBiometric = async () => {
    const res = await authenticateWithBiometrics();
    if (!res.success) {
      if (res.message && res.message !== "Authentication cancelled.") {
        Alert.alert("Biometric Unlock", res.message);
      } else if (!res.success) {
        Alert.alert("Biometric Unlock", "Unable to unlock with biometrics. Please use your PIN.");
      }
    }
  };

  return (
    <View style={[styles.page, { backgroundColor: t.colors.background }]}>
      <StatusBar style={t.mode === "dark" ? "light" : "dark"} />
      <Animated.View
        style={[styles.shell, isWide && styles.shellWide]}
        entering={FadeInDown.duration(400).springify()}
      >
        <Animated.View
          style={[styles.panel, styles.heroPanel, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}
          entering={FadeInDown.delay(100).duration(350)}
        >
          <View>
            <View style={styles.brandHeader}>
              <View style={[styles.brandIcon, { backgroundColor: `${t.colors.accent}18` }]}>
                <Ionicons name="cube-outline" size={24} color={t.colors.accent} />
              </View>
              <Text style={[styles.kicker, { color: t.colors.accent }]}>Lavanya Mart</Text>
            </View>
            <Text style={[styles.title, { color: t.colors.textPrimary }]}>Stock Verification</Text>
            <Text style={[styles.subtitle, { color: t.colors.textSecondary }]}>
              Secure inventory counting workflows for field teams, supervisors, and admin review.
            </Text>
          </View>

          <View style={styles.featureList}>
            {FEATURE_ITEMS.map((item) => (
              <View
                key={item.label}
                style={[
                  styles.featureItem,
                  { backgroundColor: t.colors.surfaceElevated, borderColor: t.colors.border },
                ]}
              >
                <Ionicons name={item.icon as any} size={18} color={t.colors.accent} />
                <Text style={[styles.featureText, { color: t.colors.textPrimary }]}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View
          style={[styles.panel, styles.actionPanel, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}
          entering={FadeInUp.delay(200).duration(350)}
        >
          <Text style={[styles.actionTitle, { color: t.colors.textPrimary }]}>Start a session</Text>
          <Text style={[styles.actionCopy, { color: t.colors.textSecondary }]}>
            {publicRegistrationEnabled
              ? "Sign in for operational access or create a new account for setup and onboarding."
              : "Sign in with the account assigned by your administrator."}
          </Text>

          {biometricAuthEnabled && lastLoggedUser?.has_pin && (
            <AppTouchable
              onPress={handleQuickBiometric}
              style={[
                styles.biometricQuickBtn,
                { backgroundColor: `${t.colors.accent}14`, borderColor: `${t.colors.accent}33` },
              ]}
              accessibilityLabel="Quick unlock with biometrics"
            >
              <Ionicons name="finger-print" size={22} color={t.colors.accent} />
              <Text style={[styles.biometricQuickText, { color: t.colors.accent }]}>
                Quick Unlock ({lastLoggedUser.full_name || lastLoggedUser.username})
              </Text>
            </AppTouchable>
          )}

          <AppTouchable
            onPress={() => router.push("/login")}
            style={[styles.primaryButton, { backgroundColor: t.colors.accent }]}
            accessibilityLabel="Sign In"
          >
            <Text style={[styles.primaryButtonText, { color: t.colors.surface }]}>Sign In</Text>
          </AppTouchable>

          {publicRegistrationEnabled ? (
            <AppTouchable
              onPress={() => router.push("/register")}
              style={[
                styles.secondaryButton,
                { backgroundColor: t.colors.surfaceElevated, borderColor: t.colors.border },
              ]}
              accessibilityLabel="Create Account"
            >
              <Text style={[styles.secondaryButtonText, { color: t.colors.textPrimary }]}>
                Create Account
              </Text>
            </AppTouchable>
          ) : null}

          <Text style={[styles.footer, { color: t.colors.textMuted }]}>Lavanya Mart 2026</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export { WelcomeScreen };
export default WelcomeScreen;

const styles = StyleSheet.create({
  page: {
    flex: 1,
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
    padding: 28,
    ...Platform.select({
      web: {
        boxShadow: "0px 16px 40px rgba(15, 23, 42, 0.08)" as any,
      },
      default: {
        elevation: 6,
        shadowColor: "rgba(15, 23, 42, 1)",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.06,
        shadowRadius: 30,
      },
    }),
  },
  heroPanel: {
    justifyContent: "space-between",
    minHeight: 360,
  },
  actionPanel: {
    maxWidth: 420,
    justifyContent: "center",
  },
  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "800",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 520,
  },
  featureList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  featureText: {
    fontSize: 14,
    fontWeight: "600",
  },
  actionTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  actionCopy: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  biometricQuickBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  biometricQuickText: {
    fontSize: 14,
    fontWeight: "700",
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  footer: {
    marginTop: 22,
    fontSize: 12,
    textAlign: "center",
  },
});
