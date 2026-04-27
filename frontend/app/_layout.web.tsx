import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Slot, usePathname, useSegments } from "expo-router";

import { BootLoadingView } from "../src/bootstrap/BootStateViews.web";

const LazyPublicThemeShell = React.lazy(
  () => import("../src/bootstrap/PublicThemeShell"),
);
const LazyProtectedWebShell = React.lazy(
  () => import("../src/bootstrap/ProtectedWebShell"),
);

const BARE_PUBLIC_SEGMENTS = new Set([
  "+not-found",
  "index",
  "welcome",
]);
const THEMED_PUBLIC_SEGMENTS = new Set([
  "forgot-password",
  "help",
  "login",
  "otp-verification",
  "register",
  "reset-password",
]);

type WebRouteMode =
  | "bare-public"
  | "themed-public"
  | "protected"
  | "pending";

const getFirstPathSegment = (pathname: string | null | undefined) => {
  const segment = pathname?.split("/").filter(Boolean)[0];
  return segment ?? null;
};

export const resolveWebRouteMode = (
  segments: readonly string[],
  pathname: string | null | undefined,
): WebRouteMode => {
  const resolvedSegment =
    (segments[0] as string | undefined) ?? getFirstPathSegment(pathname);

  if (resolvedSegment == null) {
    return pathname === "/" ? "bare-public" : "pending";
  }

  if (BARE_PUBLIC_SEGMENTS.has(resolvedSegment)) {
    return "bare-public";
  }

  if (THEMED_PUBLIC_SEGMENTS.has(resolvedSegment)) {
    return "themed-public";
  }

  return "protected";
};

function RouteFallback() {
  return (
    <View style={styles.fallback}>
      <ActivityIndicator size="small" color="#0f766e" />
    </View>
  );
}

export default function RootLayoutWeb() {
  const segments = useSegments();
  const pathname = usePathname();
  const browserPathname =
    typeof window !== "undefined" ? window.location.pathname : null;
  const resolvedPathname =
    pathname && pathname !== "/" ? pathname : browserPathname ?? pathname;
  const routeMode = resolveWebRouteMode(segments, resolvedPathname);

  if (routeMode === "pending") {
    return <RouteFallback />;
  }

  if (routeMode === "bare-public" || routeMode === "themed-public") {
    return (
      <React.Suspense fallback={<RouteFallback />}>
        <LazyPublicThemeShell>
          <Slot />
        </LazyPublicThemeShell>
      </React.Suspense>
    );
  }

  return (
    <React.Suspense fallback={<BootLoadingView initError={null} />}>
      <LazyProtectedWebShell />
    </React.Suspense>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4f7f6",
  },
});
