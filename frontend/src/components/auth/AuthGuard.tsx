import React, { useEffect } from "react";
import { useRouter, useSegments } from "expo-router";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useAuthStore } from "../../store/authStore";
import {
  getRouteForRole,
  isRouteAllowedForRole,
  UserRole,
} from "../../utils/roleNavigation";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const authPhase = useAuthStore((state) => state.authPhase);
  const { lastMessage } = useWebSocket(undefined, Boolean(user));
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let stopPolling: (() => void) | null = null;

    if (!user) {
      return;
    }

    void import("../../store/notificationStore")
      .then((module) => {
        if (cancelled) {
          module.stopNotificationPolling();
          return;
        }

        module.startNotificationPolling();
        stopPolling = module.stopNotificationPolling;
      })
      .catch((error) => {
        console.warn("[AuthGuard] Notification polling unavailable", error);
      });

    return () => {
      cancelled = true;
      stopPolling?.();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !lastMessage || lastMessage.type !== "notification") {
      return;
    }

    void import("../../store/notificationStore")
      .then((module) => {
        module.syncRealtimeNotificationMessage(lastMessage as any);
      })
      .catch((error) => {
        console.warn("[AuthGuard] Realtime notification sync unavailable", error);
      });
  }, [lastMessage, user]);

  useEffect(() => {
    if (
      !isInitialized ||
      isLoading ||
      !isHydrated ||
      authPhase === "authenticating" ||
      !segments?.length
    ) {
      return;
    }

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
  }, [authPhase, isHydrated, isInitialized, isLoading, router, segments, user]);

  return <>{children}</>;
}
