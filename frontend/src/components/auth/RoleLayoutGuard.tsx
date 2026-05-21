import React from "react";
import { Redirect } from "expo-router";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { useAuthStore } from "@/store/authStore";
import { getRouteForRole } from "@/utils/roleNavigation";
import { spacing, typography } from "@/theme/legacyCompat";
import { useUiTokens } from "@/hooks/useUiTokens";

type UserRole = "staff" | "supervisor" | "admin";

interface RoleLayoutGuardProps {
  allowedRoles: readonly UserRole[];
  children: React.ReactNode;
  redirectTo?: string;
  layoutName?: string;
}

export function RoleLayoutGuard({
  allowedRoles,
  children,
  redirectTo,
  layoutName = "RoleLayout",
}: RoleLayoutGuardProps) {
  const user = useAuthStore((state) => state.user);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const isLoading = useAuthStore((state) => state.isLoading);
  const uiTokens = useUiTokens();

  // Wait for auth to initialize before making any decisions
  if (!isInitialized || isLoading) {
    return (
      <View
        accessibilityLabel="Checking sign-in status"
        accessibilityRole="progressbar"
        style={[styles.loadingContainer, { backgroundColor: uiTokens.colors.background }]}
      >
        <ActivityIndicator size="large" color={uiTokens.colors.accent} />
        <Text style={[styles.loadingText, { color: uiTokens.colors.textSecondary }]}>
          Checking sign-in status...
        </Text>
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  const isAllowed = allowedRoles.includes(user.role);
  const resolvedRedirect = redirectTo || getRouteForRole(user.role);

  if (!isAllowed) {
    if (__DEV__) {
      console.warn(
        `⚠️ ${layoutName} rendered for non-allowed user role. ` +
          `allowed=[${allowedRoles.join(", ")}], actual=${user.role}. ` +
          `Redirecting to ${resolvedRedirect}`
      );
    }

    return <Redirect href={resolvedRedirect as any} />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    textAlign: "center",
  },
});
