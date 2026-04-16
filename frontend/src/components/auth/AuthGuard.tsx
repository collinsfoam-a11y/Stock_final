import React, { useEffect } from "react";
import { useRouter, useSegments } from "expo-router";
import { useAuthStore } from "../../store/authStore";
import {
  startNotificationPolling,
  stopNotificationPolling,
} from "../../store/notificationStore";
import {
  getRouteForRole,
  isRouteAllowedForRole,
  UserRole,
} from "../../utils/roleNavigation";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isInitialized, isLoading } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      stopNotificationPolling();
      return;
    }

    startNotificationPolling();

    return () => {
      stopNotificationPolling();
    };
  }, [user]);

  useEffect(() => {
    if (!isInitialized || isLoading || !segments?.length) return;

    const firstSegment = segments[0] as string;
    const publicSegments = new Set([
      "(auth)",
      "login",
      "welcome",
      "register",
      "help",
      "forgot-password",
      "otp-verification",
      "reset-password",
    ]);
    const inAuthGroup = publicSegments.has(firstSegment);
    const inProtectedGroup =
      firstSegment === "staff" ||
      firstSegment === "supervisor" ||
      firstSegment === "admin";
    const requiresAuth = !inAuthGroup;

    if (!user && requiresAuth) {
      console.log(
        "[AuthGuard] Unauthenticated access attempt. Redirecting to welcome.",
      );
      router.replace("/welcome");
      return;
    }

    if (user && inAuthGroup) {
      const targetRoute = getRouteForRole(user.role as UserRole);
      console.log(
        `[AuthGuard] Authenticated user in public route. Redirecting to ${targetRoute}`,
      );
      router.replace(targetRoute as any);
      return;
    }

    if (user && inProtectedGroup) {
      const currentPath = "/" + segments.join("/");
      if (!isRouteAllowedForRole(currentPath, user.role as UserRole)) {
        const targetRoute = getRouteForRole(user.role as UserRole);
        console.warn(
          `[AuthGuard] Unauthorized role access. Redirecting to ${targetRoute}`,
        );
        router.replace(targetRoute as any);
      }
    }
  }, [user, segments, isInitialized, isLoading, router]);

  return <>{children}</>;
}
