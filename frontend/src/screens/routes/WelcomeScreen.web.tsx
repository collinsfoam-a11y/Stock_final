import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { usePublicRegistrationAvailability } from "@/bootstrap/usePublicRegistrationAvailability";
import {
  getPublicRouteForRole,
  useWebPublicSession,
} from "@/bootstrap/useWebPublicSession";

const FEATURE_ITEMS = [
  "Offline-first stock counts",
  "Role-based supervisor routing",
  "Live sync and recovery safeguards",
] as const;

function WelcomeScreen() {
  const router = useRouter();
  const { status, user } = useWebPublicSession();
  const {
    status: registrationStatus,
    publicRegistrationAllowed,
  } = usePublicRegistrationAvailability();
  const { width } = useWindowDimensions();
  const isWide = width >= 960;

  React.useEffect(() => {
    if (status === "authenticated" && user) {
      const target = getPublicRouteForRole(user.role);
      router.replace(target as any);
    }
  }, [router, status, user]);

  return (
    <View style={styles.page}>
      <StatusBar style="dark" />
      <View style={[styles.shell, isWide && styles.shellWide]}>
        <View style={[styles.panel, styles.heroPanel]}>
          <Text style={styles.kicker}>Lavanya Mart</Text>
          <Text style={styles.title}>Stock Verification</Text>
          <Text style={styles.subtitle}>
            Secure counting workflows for field teams, supervisors, and admin
            review.
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
            {registrationStatus === "loading"
              ? "Sign in for operational access."
              : registrationStatus === "error"
                ? "Sign in for operational access. We couldn't verify whether self-registration is available on this network."
              : publicRegistrationAllowed
                ? "Sign in for operational access or create the first account to finish setup."
                : "Sign in for operational access. New accounts are created by administrators after setup."}
          </Text>

          <Pressable
            onPress={() => router.push("/login")}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </Pressable>

          {publicRegistrationAllowed ? (
            <Pressable
              onPress={() => router.push("/register")}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Create Account</Text>
            </Pressable>
          ) : registrationStatus === "error" ? (
            <Text style={styles.helperNote}>
              Connect to the store network or ask an administrator to add your account.
            </Text>
          ) : registrationStatus === "ready" ? (
            <Text style={styles.helperNote}>
              Account creation is reserved for the initial setup window.
            </Text>
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
    backgroundColor: "#f4f7f6",
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
    borderColor: "#d9e5e2",
    backgroundColor: "#ffffff",
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
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#0f766e",
    marginBottom: 14,
  },
  title: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: "#475569",
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
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  featureDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#0f766e",
  },
  featureText: {
    fontSize: 15,
    color: "#334155",
  },
  actionTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 10,
  },
  actionCopy: {
    fontSize: 15,
    lineHeight: 22,
    color: "#475569",
    marginBottom: 28,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e",
    marginBottom: 12,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  secondaryButtonPressed: {
    backgroundColor: "#f8fafc",
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
  },
  helperNote: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 20,
    color: "#64748b",
  },
  footer: {
    marginTop: 22,
    fontSize: 12,
    color: "#64748b",
  },
});
