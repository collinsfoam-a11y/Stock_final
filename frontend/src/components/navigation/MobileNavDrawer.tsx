/**
 * MobileNavDrawer - persistent cross-section navigation for admin/supervisor on
 * mobile/native, where the web sidebars are not rendered. Shows a floating menu
 * button that opens a slide-in drawer listing the same nav items as the web
 * sidebar (single source of truth: admin/supervisorNavShared).
 */

import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useSegments } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "@/hooks/useUiTokens";
import { useAuthStore } from "@/store/authStore";
import type { ThemeTokens } from "@/theme/themeTokens";
import {
  getAccessibleButtonProps,
  getMinimumTouchTargetStyle,
} from "@/utils/accessibility";
import { ADMIN_NAV_GROUPS } from "./adminNavShared";
import { SUPERVISOR_NAV_GROUPS } from "./supervisorNavShared";

interface DrawerNavItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

interface DrawerNavGroup {
  title: string;
  items: DrawerNavItem[];
}

interface MobileNavDrawerProps {
  /** Overrides the role derived from the auth store (mainly for testing). */
  role?: "admin" | "supervisor";
  testID?: string;
}

function groupsForRole(role: "admin" | "supervisor"): DrawerNavGroup[] {
  const source = role === "admin" ? ADMIN_NAV_GROUPS : SUPERVISOR_NAV_GROUPS;
  // Narrow each source to the common drawer shape (admin items carry an extra
  // `subtitle` the drawer does not use).
  return source.map((group) => ({
    title: group.title,
    items: group.items.map((item) => ({
      key: item.key,
      label: item.label,
      icon: item.icon,
      route: item.route,
    })),
  }));
}

export function MobileNavDrawer({ role, testID }: MobileNavDrawerProps) {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const uiTokens = useUiTokens();
  const storeRole = useAuthStore((state) => state.user?.role);
  const [open, setOpen] = useState(false);

  const effectiveRole: "admin" | "supervisor" =
    role ?? (storeRole === "admin" ? "admin" : "supervisor");
  const groups = useMemo(() => groupsForRole(effectiveRole), [effectiveRole]);
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);

  const currentRoute = (segments as string[]).join("/");
  const isActive = (route: string) => {
    const routePath = route.replace(/^\//, "");
    return currentRoute === routePath || currentRoute.startsWith(routePath + "/");
  };

  const handleSelect = (route: string) => {
    setOpen(false);
    router.push(route as never);
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + uiTokens.spacing.lg }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        testID={testID}
        {...getAccessibleButtonProps({ label: "Open navigation menu" })}
      >
        <Ionicons name="menu" size={24} color={uiTokens.colors.background} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.panel, { paddingTop: insets.top + uiTokens.spacing.lg }]}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>
                {effectiveRole === "admin" ? "Admin" : "Supervisor"}
              </Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                style={styles.closeButton}
                {...getAccessibleButtonProps({ label: "Close navigation menu" })}
              >
                <Ionicons name="close" size={22} color={uiTokens.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {groups.map((group) => (
                <View key={group.title} style={styles.group}>
                  <Text style={styles.groupTitle}>{group.title.toUpperCase()}</Text>
                  {group.items.map((item) => {
                    const active = isActive(item.route);
                    return (
                      <TouchableOpacity
                        key={item.key}
                        style={[styles.item, active && styles.itemActive]}
                        onPress={() => handleSelect(item.route)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={item.label}
                      >
                        <Ionicons
                          name={item.icon}
                          size={20}
                          color={active ? uiTokens.colors.accent : uiTokens.colors.textSecondary}
                        />
                        <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const createStyles = (uiTokens: ThemeTokens) =>
  StyleSheet.create({
    fab: {
      position: "absolute",
      left: uiTokens.spacing.md,
      zIndex: 50,
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: uiTokens.colors.accent,
      boxShadow: "0px 2px 6px rgba(0, 0, 0, 0.25)",
      elevation: 6,
    },
    backdrop: {
      flex: 1,
      flexDirection: "row",
      backgroundColor: "rgba(0, 0, 0, 0.45)",
    },
    panel: {
      width: "82%",
      maxWidth: 340,
      height: "100%",
      paddingHorizontal: uiTokens.spacing.md,
      paddingBottom: uiTokens.spacing.lg,
      backgroundColor: uiTokens.colors.background,
      borderRightWidth: 1,
      borderRightColor: uiTokens.colors.border,
    },
    panelHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: uiTokens.spacing.md,
    },
    panelTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: uiTokens.colors.textPrimary,
    },
    closeButton: {
      ...getMinimumTouchTargetStyle(),
      alignItems: "center",
      justifyContent: "center",
    },
    group: {
      marginBottom: uiTokens.spacing.lg,
    },
    groupTitle: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      color: uiTokens.colors.textMuted,
      marginBottom: uiTokens.spacing.xs,
    },
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: uiTokens.spacing.sm,
      paddingVertical: uiTokens.spacing.sm,
      paddingHorizontal: uiTokens.spacing.sm,
      borderRadius: uiTokens.radius.md,
    },
    itemActive: {
      backgroundColor: uiTokens.colors.surface,
    },
    itemLabel: {
      fontSize: 15,
      color: uiTokens.colors.textPrimary,
    },
    itemLabelActive: {
      color: uiTokens.colors.accent,
      fontWeight: "600",
    },
  });

export default MobileNavDrawer;
