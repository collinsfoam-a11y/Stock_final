import React, { useEffect } from "react";
import { useGlobalSearchParams, usePathname, useRouter, useSegments } from "expo-router";
import { useAuthStore } from "../../store/authStore";
import { getRouteForRole, isRouteAllowedForRole, UserRole } from "../../utils/roleNavigation";
import { flags } from "../../constants/flags";

const buildQueryString = (params: Record<string, unknown>): string => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry !== undefined && entry !== null) {
          query.append(key, String(entry));
        }
      });
      continue;
    }
    query.append(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
};

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const isLoading = useAuthStore((state) => state.isLoading);
  const segments = useSegments();
  const pathname = usePathname();
  const globalSearchParams = useGlobalSearchParams();
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
    if (!isInitialized || isLoading || !segments?.length) return;

    let cancelled = false;
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
      firstSegment === "staff" || firstSegment === "supervisor" || firstSegment === "admin";
    const requiresAuth = !inAuthGroup;
    const fallbackPath = "/" + segments.join("/");
    const currentPath = `${
      pathname && pathname.startsWith("/") ? pathname : fallbackPath
    }${buildQueryString(globalSearchParams as Record<string, unknown>)}`;

    if (!user && requiresAuth) {
      console.log("[AuthGuard] Unauthenticated access attempt. Redirecting to login.");
      if (flags.uiAuthRedirectV2) {
        void useAuthStore
          .getState()
          .setPendingRedirect(currentPath)
          .catch((error) => {
            console.warn("[AuthGuard] Failed to set pending redirect", error);
          });
        router.replace("/login");
      } else {
        router.replace("/welcome");
      }
      return;
    }

    if (user && inAuthGroup) {
      if (flags.uiAuthRedirectV2) {
        const authState = useAuthStore.getState();
        void authState
          .peekPendingRedirect()
          .then(async (pendingPath) => {
            let targetRoute = getRouteForRole(user.role as UserRole);

            if (pendingPath && isRouteAllowedForRole(pendingPath, user.role as UserRole)) {
              const consumedPath = await authState.consumePendingRedirect();
              if (consumedPath && isRouteAllowedForRole(consumedPath, user.role as UserRole)) {
                targetRoute = consumedPath;
              }
            } else if (pendingPath) {
              await authState.clearPendingRedirect();
            }

            if (cancelled) return;
            console.log(
              `[AuthGuard] Authenticated user in public route. Redirecting to ${targetRoute}`
            );
            router.replace(targetRoute as any);
          })
          .catch((error) => {
            if (cancelled) return;
            console.warn("[AuthGuard] Failed to resolve pending redirect", error);
            const targetRoute = getRouteForRole(user.role as UserRole);
            router.replace(targetRoute as any);
          });
        return () => {
          cancelled = true;
        };
      }

      const targetRoute = getRouteForRole(user.role as UserRole);
      console.log(`[AuthGuard] Authenticated user in public route. Redirecting to ${targetRoute}`);
      router.replace(targetRoute as any);
      return;
    }

    if (user && inProtectedGroup) {
      const rolePath = pathname && pathname.startsWith("/") ? pathname : "/" + segments.join("/");
      if (!isRouteAllowedForRole(rolePath, user.role as UserRole)) {
        const targetRoute = getRouteForRole(user.role as UserRole);
        if (flags.uiAuthRedirectV2) {
          void useAuthStore
            .getState()
            .clearPendingRedirect()
            .catch((error) => {
              console.warn("[AuthGuard] Failed to clear pending redirect", error);
            });
        }
        console.warn(`[AuthGuard] Unauthorized role access. Redirecting to ${targetRoute}`);
        router.replace(targetRoute as any);
      }
    }

    return undefined;
  }, [user, segments, pathname, globalSearchParams, isInitialized, isLoading, router]);

  return <>{children}</>;
}
