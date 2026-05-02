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
import {
  View,
  Text,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { auroraTheme } from "@/theme/auroraTheme";
import { RoleLayoutGuard } from "@/components/auth/RoleLayoutGuard";
import { SupervisorSidebar } from "@/components/navigation";
import { AnimatedPressable, GlassCard, ScreenContainer } from "@/components/ui";
import { useSettingsStore } from "@/store/settingsStore";
import { isSupervisorRouteEnabled } from "@/constants/roleFeatureFlags";

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
  const isLargeScreen = width >= 1024 && Platform.OS === "web";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const currentRoute = segmentList[1];
  const isFeatureDisabledRoute = Boolean(
    currentRoute && !isSupervisorRouteEnabled(currentRoute),
  );
  const isOfflineBlockedRoute = Boolean(
    offlineMode && currentRoute && OFFLINE_BLOCKED_ROUTES.has(currentRoute),
  );
  const blockedRouteTitle = useMemo(
    () =>
      OFFLINE_ROUTE_LABELS[currentRoute || ""] || "Supervisor View",
    [currentRoute],
  );

  if (isFeatureDisabledRoute) {
    return (
      <RoleLayoutGuard
        allowedRoles={["supervisor", "admin"]}
        layoutName="SupervisorLayout"
      >
        <Redirect href="/supervisor/dashboard" />
      </RoleLayoutGuard>
    );
  }

  return (
    <RoleLayoutGuard
      allowedRoles={["supervisor", "admin"]}
      layoutName="SupervisorLayout"
    >
      {isLargeScreen ? (
        <View style={styles.webContainer}>
          <SupervisorSidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
          <View style={styles.mainContent}>
            {isOfflineBlockedRoute ? (
              <SupervisorOfflineFallback
                routeTitle={blockedRouteTitle}
                onNavigate={router.push}
              />
            ) : (
              <Slot />
            )}
          </View>
        </View>
      ) : (
        isOfflineBlockedRoute ? (
          <SupervisorOfflineFallback
            routeTitle={blockedRouteTitle}
            onNavigate={router.push}
          />
        ) : (
          <Stack screenOptions={{ headerShown: false }} />
        )
      )}
    </RoleLayoutGuard>
  );
}

function SupervisorOfflineFallback({
  routeTitle,
  onNavigate,
}: {
  routeTitle: string;
  onNavigate: (href: any) => void;
}) {
  return (
    <ScreenContainer
      gradient
      header={{
        title: routeTitle,
        subtitle: "Unavailable while offline mode is enabled",
        showBackButton: true,
      }}
    >
      <View style={styles.offlineContainer}>
        <GlassCard style={styles.offlineCard} variant="strong" elevation="md">
          <View style={styles.offlineHeader}>
            <Ionicons
              name="cloud-offline-outline"
              size={22}
              color={auroraTheme.colors.warning[500]}
            />
            <Text style={styles.offlineTitle}>
              This supervisor screen needs a live connection
            </Text>
          </View>
          <Text style={styles.offlineBody}>
            The selected view depends on backend data or live workflow actions
            that are not cached locally. Turn off offline mode to reopen it, or
            move to one of the supervisor screens that still works offline.
          </Text>
        </GlassCard>

        <View style={styles.quickLinks}>
          {OFFLINE_SAFE_LINKS.map((link) => (
            <AnimatedPressable
              key={link.route}
              style={styles.quickLinkButton}
              onPress={() => onNavigate(link.route as any)}
            >
              <Ionicons
                name={link.icon as keyof typeof Ionicons.glyphMap}
                size={18}
                color={auroraTheme.colors.primary[400]}
              />
              <Text style={styles.quickLinkText}>{link.label}</Text>
            </AnimatedPressable>
          ))}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: auroraTheme.colors.background.primary,
  },
  mainContent: {
    flex: 1,
    minWidth: 0,
    backgroundColor: auroraTheme.colors.background.primary,
  },
  offlineContainer: {
    flex: 1,
    padding: auroraTheme.spacing.lg,
    gap: auroraTheme.spacing.lg,
  },
  offlineCard: {
    padding: auroraTheme.spacing.lg,
  },
  offlineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: auroraTheme.spacing.sm,
    marginBottom: auroraTheme.spacing.sm,
  },
  offlineTitle: {
    flex: 1,
    color: auroraTheme.colors.text.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  offlineBody: {
    color: auroraTheme.colors.text.secondary,
    fontSize: 13,
    lineHeight: 20,
  },
  quickLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: auroraTheme.spacing.md,
  },
  quickLinkButton: {
    minWidth: 180,
    flexDirection: "row",
    alignItems: "center",
    gap: auroraTheme.spacing.sm,
    paddingHorizontal: auroraTheme.spacing.md,
    paddingVertical: auroraTheme.spacing.md,
    borderRadius: auroraTheme.borderRadius.lg,
    backgroundColor: auroraTheme.colors.surface.base,
    borderWidth: 1,
    borderColor: auroraTheme.colors.border.subtle,
  },
  quickLinkText: {
    color: auroraTheme.colors.text.primary,
    fontSize: 14,
    fontWeight: "600",
  },
});
