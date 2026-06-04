/**
 * StaffCrashScreen Component
 *
 * Fallback UI for ErrorBoundary in staff layouts.
 * Provides a recovery path when staff screens crash.
 * Optimized for scan-first workflow recovery.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from "react-native";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getAccessibleButtonProps } from "@/utils/accessibility";

interface StaffCrashScreenProps {
  error: Error;
  resetError: () => void;
}

const staleReactQueryRecoveryKey = "stock-verify:stale-react-query-recovery-at";

type RouteSearchParams = Record<string, unknown>;

type StaffCrashRecoveryTarget = {
  accessibilityLabel: string;
  href: string;
  label: string;
};

const getSingleSearchParam = (value: unknown): string | null => {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = String(candidate ?? "").trim();
  return normalized ? normalized : null;
};

const buildQueryString = (params: RouteSearchParams): string => {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      if (entry === undefined || entry === null) continue;
      query.append(key, String(entry));
    }
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
};

export const resolveStaffCrashRecoveryTarget = (
  pathname: string | null | undefined,
  searchParams: RouteSearchParams
): StaffCrashRecoveryTarget => {
  const sessionId = getSingleSearchParam(searchParams.sessionId);

  if (sessionId && pathname === "/staff/scan") {
    return {
      accessibilityLabel: "Return to current scan session",
      href: `/staff/scan${buildQueryString(searchParams)}`,
      label: "Back to Scan",
    };
  }

  if (sessionId) {
    return {
      accessibilityLabel: "Return to current scan session",
      href: `/staff/scan?sessionId=${encodeURIComponent(sessionId)}`,
      label: "Back to Scan",
    };
  }

  return {
    accessibilityLabel: "Return to staff home",
    href: "/staff/home",
    label: "Staff Home",
  };
};

export const isStaleReactQueryBundleError = (error: Error): boolean => {
  const details = `${error?.message ?? ""}\n${error?.stack ?? ""}`;
  // Stale web bundles surface as "<hook> is not a function" for hooks whose
  // module/context shifted between chunks (useQueryClient, useReducedMotion, …).
  return (
    /(useQueryClient|useReducedMotion)/i.test(details) &&
    /(not a function|undefined)/i.test(details)
  );
};

export const recoverFromStaleWebBundle = async (): Promise<boolean> => {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return false;
  }

  const now = Date.now();
  const lastRecovery = Number(window.sessionStorage.getItem(staleReactQueryRecoveryKey) ?? "0");
  if (Number.isFinite(lastRecovery) && now - lastRecovery < 60_000) {
    return false;
  }

  window.sessionStorage.setItem(staleReactQueryRecoveryKey, String(now));

  if ("caches" in window) {
    const cacheNames = await window.caches.keys();
    await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
  }

  window.location.reload();
  return true;
};

export const StaffCrashScreen: React.FC<StaffCrashScreenProps> = ({ error, resetError }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useGlobalSearchParams();
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const staleBundleError = useMemo(() => isStaleReactQueryBundleError(error), [error]);
  const recoveryTarget = useMemo(
    () => resolveStaffCrashRecoveryTarget(pathname, searchParams as RouteSearchParams),
    [pathname, searchParams]
  );
  const [isRecovering, setIsRecovering] = useState(false);

  const handleRetry = useCallback(() => {
    if (staleBundleError && Platform.OS === "web") {
      setIsRecovering(true);
      void recoverFromStaleWebBundle()
        .then((didReload) => {
          if (!didReload) {
            setIsRecovering(false);
            resetError();
          }
        })
        .catch(() => {
          setIsRecovering(false);
          resetError();
        });
      return;
    }

    resetError();
  }, [resetError, staleBundleError]);

  useEffect(() => {
    if (!staleBundleError || Platform.OS !== "web") {
      return;
    }

    setIsRecovering(true);
    const recoveryTimer = setTimeout(() => {
      void recoverFromStaleWebBundle()
        .then((didReload) => {
          if (!didReload) {
            setIsRecovering(false);
          }
        })
        .catch(() => {
          setIsRecovering(false);
        });
    }, 250);

    return () => clearTimeout(recoveryTimer);
  }, [staleBundleError]);

  const handleGoToScan = () => {
    resetError();
    router.replace(recoveryTarget.href as any);
  };

  const handleLogout = () => {
    resetError();
    router.replace("/welcome" as any);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={uiTokens.colors.error} />
        </View>

        <Text style={styles.title}>Scan Workflow Recovery Required</Text>
        <Text style={styles.subtitle}>
          {isRecovering
            ? "Refreshing app files so the scan workflow can continue."
            : "The scanning interface stopped before the current workflow could finish rendering."}
        </Text>

        <View style={styles.errorBox}>
          <Text style={styles.errorLabel}>Error Details:</Text>
          <Text style={styles.errorMessage}>
            {error.message ||
              "The scan screen failed before technical details were available. Retry, or return to scan and continue from the last saved item."}
          </Text>
        </View>

        {__DEV__ && error.stack && (
          <ScrollView style={styles.stackContainer}>
            <Text style={styles.stackTitle}>Stack Trace (Dev Only):</Text>
            <Text style={styles.stack}>{error.stack}</Text>
          </ScrollView>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            {...getAccessibleButtonProps({ label: "Retry loading scan workflow" })}
            style={[styles.button, styles.primaryButton]}
            onPress={handleRetry}
            disabled={isRecovering}
          >
            <Ionicons name="refresh" size={20} color={uiTokens.colors.surface} />
            <Text style={styles.primaryButtonText}>
              {isRecovering ? "Refreshing..." : staleBundleError ? "Refresh App" : "Try Again"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            {...getAccessibleButtonProps({ label: recoveryTarget.accessibilityLabel })}
            style={[styles.button, styles.secondaryButton]}
            onPress={handleGoToScan}
          >
            <Ionicons name="scan-outline" size={20} color={uiTokens.colors.accent} />
            <Text style={styles.secondaryButtonText}>{recoveryTarget.label}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            {...getAccessibleButtonProps({ label: "Log out after scan workflow error" })}
            style={[styles.button, styles.outlineButton]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={20} color={uiTokens.colors.textSecondary} />
            <Text style={styles.outlineButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

type CrashTokens = ReturnType<typeof useUiTokens>;

const createStyles = (uiTokens: CrashTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: uiTokens.colors.background,
      justifyContent: "center",
      alignItems: "center",
      padding: uiTokens.spacing["2xl"],
    },
    content: {
      width: "100%",
      maxWidth: 400,
      alignItems: "center",
    },
    iconContainer: {
      width: 100,
      height: 100,
      borderRadius: uiTokens.radius.full,
      backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.1),
      justifyContent: "center",
      alignItems: "center",
      marginBottom: uiTokens.spacing["2xl"],
    },
    title: {
      fontSize: 24,
      fontWeight: "700",
      color: uiTokens.colors.textPrimary,
      textAlign: "center",
      marginBottom: uiTokens.spacing.sm,
    },
    subtitle: {
      fontSize: 16,
      color: uiTokens.colors.textSecondary,
      textAlign: "center",
      marginBottom: uiTokens.spacing["2xl"],
    },
    errorBox: {
      width: "100%",
      backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.08),
      borderRadius: uiTokens.radius.lg,
      padding: uiTokens.spacing.md,
      marginBottom: uiTokens.spacing.md,
      borderWidth: 1,
      borderColor: colorWithAlpha(uiTokens.colors.error, 0.24),
    },
    errorLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: uiTokens.colors.error,
      marginBottom: uiTokens.spacing.xs,
      textTransform: "uppercase",
    },
    errorMessage: {
      fontSize: 14,
      color: uiTokens.colors.textPrimary,
      fontFamily: "monospace",
    },
    stackContainer: {
      width: "100%",
      maxHeight: 150,
      backgroundColor: uiTokens.colors.surface,
      borderRadius: uiTokens.radius.md,
      padding: uiTokens.spacing.md,
      marginBottom: uiTokens.spacing["2xl"],
    },
    stackTitle: {
      fontSize: 11,
      fontWeight: "600",
      color: uiTokens.colors.textMuted,
      marginBottom: uiTokens.spacing.sm,
      textTransform: "uppercase",
    },
    stack: {
      fontSize: 10,
      color: uiTokens.colors.textSecondary,
      fontFamily: "monospace",
    },
    actions: {
      width: "100%",
      gap: uiTokens.spacing.md,
    },
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: uiTokens.spacing.md,
      paddingHorizontal: uiTokens.spacing["2xl"],
      borderRadius: uiTokens.radius.lg,
      gap: uiTokens.spacing.sm,
      minHeight: 48,
    },
    primaryButton: {
      backgroundColor: uiTokens.colors.accent,
    },
    primaryButtonText: {
      color: uiTokens.colors.surface,
      fontSize: 16,
      fontWeight: "600",
    },
    secondaryButton: {
      backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.1),
    },
    secondaryButtonText: {
      color: uiTokens.colors.accent,
      fontSize: 16,
      fontWeight: "600",
    },
    outlineButton: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
    },
    outlineButtonText: {
      color: uiTokens.colors.textSecondary,
      fontSize: 16,
      fontWeight: "500",
    },
  });

export default StaffCrashScreen;
