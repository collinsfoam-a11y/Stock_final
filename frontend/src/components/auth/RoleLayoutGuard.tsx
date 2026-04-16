import React from "react";
import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuthStore } from "@/store/authStore";
import { getRouteForRole } from "@/utils/roleNavigation";

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
  const { user, isInitialized, isLoading } = useAuthStore();

  // Wait for auth to initialize before making any decisions
  if (!isInitialized || isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const isAllowed = allowedRoles.includes(user.role);
  const resolvedRedirect = redirectTo || getRouteForRole(user.role);

  if (!isAllowed) {
    if (__DEV__) {
      console.warn(
        `⚠️ ${layoutName} rendered for non-allowed user role. ` +
          `allowed=[${allowedRoles.join(", ")}], actual=${user.role}. ` +
          `Redirecting to ${resolvedRedirect}`,
      );
    }

    return <Redirect href={resolvedRedirect as any} />;
  }

  return <>{children}</>;
}
