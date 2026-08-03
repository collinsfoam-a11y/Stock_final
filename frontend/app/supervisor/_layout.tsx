/**
 * Supervisor Layout - Navigation structure for supervisor role
 * Features:
 * - Web/Tablet: Sidebar + Slot navigation (SupervisorSidebar)
 * - Mobile: Stack-based navigation with Aurora design
 * - Custom header with session info
 * - Quick action buttons for common tasks
 */

import React, { useMemo, useState } from "react";
import { Redirect, Stack, Slot, useRouter, useSegments } from "expo-router";
import { View, Text, StyleSheet, Platform, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { RoleLayoutGuard } from "@/components/auth/RoleLayoutGuard";
import { AdminSidebar, MobileNavDrawer, SupervisorSidebar } from "@/components/navigation";
import { useSettingsStore } from "@/store/settingsStore";
import { useAuthStore } from "@/store/authStore";
import { isSupervisorRouteEnabled } from "@/constants/roleFeatureFlags";
import { useUiTokens } from "@/hooks/useUiTokens";
import type { ThemeTokens } from "@/theme/themeTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { ModernCard } from "@/components/ui/ModernCard";
import { ScreenContainer } from "@/components/ui/ScreenContainer";

const OFFLINE_BLOCKED_ROUTES = new Set([
  "activity-logs",
  "dashboard",
  "sync-conflicts",
  "user-workflows",
]);

const OFFLINE_ROUTE_LABELS: Record<string, string> = {
  "activity-logs": "Activity Logs",
  dashboard: "Dashboard",
  session: "Session Details",
  sessions: "Sessions",
  "sync-conflicts": "Sync Conflicts",
  "user-workflows": "User Workflows",
};

const OFFLINE_SAFE_LINKS = [
  { icon: "cube-outline", label: "Items", route: "/supervisor/items" },
  {
    icon: "alert-circle-outline",
    label: "Variances",
    route: "/supervisor/variances",
  },
  {
    icon: "cloud-offline-outline",
    label: "Offline Queue",
    route: "/supervisor/offline-queue",
  },
  { icon: "settings-outline", label: "Settings", route: "/supervisor/settings" },
] as const;

export default function SupervisorLayout() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const segments = useSegments();
  const segmentList = segments as string[];
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const isLargeScreen = width >= 1024 && Platform.OS === "web";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isAdmin = useAuthStore((state) => state.user?.role === "admin");
  const currentRoute = segmentList[1];
  const isFeatureDisabledRoute = Boolean(currentRoute && !isSupervisorRouteEnabled(currentRoute));
  const isOfflineBlockedRoute = Boolean(
    offlineMode && currentRoute && OFFLINE_BLOCKED_ROUTES.has(currentRoute)
  );
  const blockedRouteTitle = useMemo(
    () => OFFLINE_ROUTE_LABELS[currentRoute || ""] || "Supervisor View",
    [currentRoute]
  );

  if (isFeatureDisabledRoute) {
    return (
      <RoleLayoutGuard allowedRoles={["supervisor", "admin"]} layoutName="SupervisorLayout">
        <Redirect href="/supervisor/dashboard" />
      </RoleLayoutGuard>
    );
  }

  return (
    <RoleLayoutGuard allowedRoles={["supervisor", "admin"]} layoutName="SupervisorLayout">
      {isLargeScreen ? (
        <View style={styles.webContainer}>
          {isAdmin ? (
            <AdminSidebar
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
          ) : (
            <SupervisorSidebar
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
          )}
          <View
            style={[
              styles.mainContent,
              {
                backgroundColor: uiTokens.colors.background,
              },
            ]}
          >
            {isOfflineBlockedRoute ? (
              <SupervisorOfflineFallback
                routeTitle={blockedRouteTitle}
                onNavigate={router.push}
                styles={styles}
                uiTokens={uiTokens}
              />
            ) : (
              <Slot />
            )}
          </View>
        </View>
      ) : isOfflineBlockedRoute ? (
        <SupervisorOfflineFallback
          routeTitle={blockedRouteTitle}
          onNavigate={router.push}
          styles={styles}
          uiTokens={uiTokens}
        />
      ) : (
        <View style={styles.mobileContainer}>
          <Stack screenOptions={{ headerShown: false }} />
          <MobileNavDrawer />
        </View>
      )}
    </RoleLayoutGuard>
  );
}

function SupervisorOfflineFallback({
  routeTitle,
  onNavigate,
  styles,
  uiTokens,
}: {
  routeTitle: string;
  onNavigate: (href: any) => void;
  styles: SupervisorLayoutStyles;
  uiTokens: ThemeTokens;
}) {
  return (
    <ScreenContainer
      header={{
        title: routeTitle,
        subtitle: "Unavailable while offline mode is enabled",
        showBackButton: true,
      }}
    >
      <View style={styles.offlineContainer}>
        <ModernCard style={styles.offlineCard} variant="outlined" elevation="sm" padding={0}>
          <View style={styles.offlineHeader}>
            <Ionicons name="cloud-offline-outline" size={22} color={uiTokens.colors.warning} />
            <Text style={styles.offlineTitle}>This supervisor screen needs a live connection</Text>
          </View>
          <Text style={styles.offlineBody}>
            The selected view depends on backend data or live workflow actions that are not cached
            locally. Turn off offline mode to reopen it, or move to one of the supervisor screens
            that still works offline.
          </Text>
        </ModernCard>

        <View style={styles.quickLinks}>
          {OFFLINE_SAFE_LINKS.map((link) => (
            <AnimatedPressable
              key={link.route}
              style={styles.quickLinkButton}
              onPress={() => onNavigate(link.route as any)}
              {...getAccessibleButtonProps({ label: `Open ${link.label}` })}
            >
              <Ionicons
                name={link.icon as keyof typeof Ionicons.glyphMap}
                size={18}
                color={uiTokens.colors.accent}
              />
              <Text style={styles.quickLinkText}>{link.label}</Text>
            </AnimatedPressable>
          ))}
        </View>
      </View>
    </ScreenContainer>
  );
}

type SupervisorLayoutStyles = ReturnType<typeof createStyles>;

const createStyles = (uiTokens: ThemeTokens) =>
  StyleSheet.create({
  webContainer: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: uiTokens.colors.background,
  },
  mainContent: {
    flex: 1,
    minWidth: 0,
    backgroundColor: uiTokens.colors.background,
  },
  mobileContainer: {
    flex: 1,
  },
  offlineContainer: {
    flex: 1,
    padding: uiTokens.spacing.lg,
    gap: uiTokens.spacing.lg,
  },
  offlineCard: {
    padding: uiTokens.spacing.lg,
  },
  offlineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.spacing.sm,
    marginBottom: uiTokens.spacing.sm,
  },
  offlineTitle: {
    flex: 1,
    color: uiTokens.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  offlineBody: {
    color: uiTokens.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  quickLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTokens.spacing.md,
  },
  quickLinkButton: {
    ...getMinimumTouchTargetStyle(),
    minWidth: 180,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.spacing.sm,
    paddingHorizontal: uiTokens.spacing.md,
    paddingVertical: uiTokens.spacing.md,
    borderRadius: uiTokens.radius.lg,
    backgroundColor: uiTokens.colors.surface,
    borderWidth: 1,
    borderColor: uiTokens.colors.border,
  },
  quickLinkText: {
    color: uiTokens.colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
});
