/**
 * SupervisorSidebar Component - Persistent sidebar for supervisor/admin
 * Collapsible on mobile (drawer), always visible on web/tablet
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, useWindowDimensions, ViewStyle } from "react-native";
import { useRouter, useSegments } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../../hooks/useTheme";
import { useAuthStore } from "../../store/authStore";
import { layout, spacing, typography, breakpoints } from "../../styles/globalStyles";
import { SUPERVISOR_NAV_GROUPS, type SupervisorNavItem } from "./supervisorNavShared";

import { semanticColors as uiSemanticColors } from "@/theme/unified";

import { AppTouchable } from "@/components/ui/AppTouchable";

interface SupervisorSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  style?: ViewStyle;
  testID?: string;
}

export const SupervisorSidebar: React.FC<SupervisorSidebarProps> = ({
  collapsed = false,
  onToggleCollapse,
  style,
  testID,
}) => {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const { user, logout } = useAuthStore();
  const { width } = useWindowDimensions();
  const isMobile = width < breakpoints.tablet;

  // On mobile, show as drawer (controlled by parent)
  // On web/tablet, show as persistent sidebar
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(SUPERVISOR_NAV_GROUPS.map((g) => g.title))
  );

  const currentRoute = segments.join("/");
  const isActive = (route: string) => {
    const routePath = route.replace(/^\//, "");
    return currentRoute === routePath || currentRoute.startsWith(routePath + "/");
  };

  const handleItemPress = (item: SupervisorNavItem) => {
    router.push(item.route as any);
  };

  const handleLogout = async () => {
    await logout();
  };

  const toggleGroup = (title: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(title)) {
      newExpanded.delete(title);
    } else {
      newExpanded.add(title);
    }
    setExpandedGroups(newExpanded);
  };

  const sidebarWidth = collapsed ? layout.sidebarCollapsedWidth : layout.sidebarWidth;
  const panelBackground = theme.colors.surfaceElevated || theme.colors.surface;
  const subtleBorder = theme.colors.borderLight || theme.colors.border;
  const activeBackground = theme.colors.overlayPrimary || "rgba(14, 165, 233, 0.14)";

  if (isMobile && !collapsed) {
    // On mobile, sidebar is handled by drawer component
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        {
          width: sidebarWidth,
          backgroundColor: theme.colors.surface,
          borderRightColor: theme.colors.border,
        },
        style,
      ]}
      testID={testID}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.brandSection,
            { borderBottomColor: subtleBorder, backgroundColor: panelBackground },
          ]}
        >
          <View
            style={[
              styles.brandBadge,
              { backgroundColor: activeBackground, borderColor: subtleBorder },
            ]}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={collapsed ? 20 : 18}
              color={theme.colors.primary}
            />
          </View>

          {!collapsed && (
            <View style={styles.brandCopy}>
              <Text style={[styles.brandTitle, { color: theme.colors.text }]}>Supervisor Hub</Text>
              <Text style={[styles.brandSubtitle, { color: theme.colors.textSecondary }]}>
                Daily operations made simple
              </Text>
            </View>
          )}

          {onToggleCollapse && (
            <AppTouchable
              style={[
                styles.collapseButton,
                { backgroundColor: activeBackground, borderColor: subtleBorder },
              ]}
              onPress={onToggleCollapse}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={
                collapsed ? "Expand supervisor sidebar" : "Collapse supervisor sidebar"
              }
            >
              <Ionicons
                name={collapsed ? "chevron-forward-outline" : "chevron-back-outline"}
                size={18}
                color={theme.colors.text}
              />
            </AppTouchable>
          )}
        </View>

        {/* User Profile Section */}
        {!collapsed && (
          <View
            style={[
              styles.profileSection,
              {
                borderBottomColor: subtleBorder,
                backgroundColor: panelBackground,
              },
            ]}
          >
            <View style={styles.profileAvatar}>
              <Ionicons name="person" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: theme.colors.text }]} numberOfLines={1}>
                {user?.full_name || "User"}
              </Text>
              <Text style={[styles.profileRole, { color: theme.colors.textSecondary }]}>
                {user?.role === "admin" ? "Administrator" : "Supervisor"}
              </Text>
            </View>
          </View>
        )}

        {/* Navigation Groups */}
        {SUPERVISOR_NAV_GROUPS.map((group) => {
          const isExpanded = expandedGroups.has(group.title);

          return (
            <View
              key={group.title}
              style={[
                styles.group,
                {
                  backgroundColor: panelBackground,
                  borderColor: subtleBorder,
                },
              ]}
            >
              {!collapsed && (
                <AppTouchable
                  style={styles.groupHeader}
                  onPress={() => toggleGroup(group.title)}
                  activeOpacity={0.7}
 >
                  <Text style={[styles.groupTitle, { color: theme.colors.textSecondary }]}>
                    {group.title}
                  </Text>
                  <Ionicons
                    name={isExpanded ? "chevron-down" : "chevron-forward"}
                    size={16}
                    color={theme.colors.textSecondary}
                  />
                </AppTouchable>
              )}
              {(!collapsed && isExpanded) || collapsed ? (
                <View style={styles.groupItems}>
                  {group.items.map((item) => {
                    const active = isActive(item.route);
                    const iconColor = active ? theme.colors.primary : theme.colors.textSecondary;
                    const bgColor = active
                      ? theme.colors.overlayPrimary || "rgba(76, 175, 80, 0.1)"
                      : "transparent";

                    return (
                      <AppTouchable
                        key={item.key}
                        style={[
                          styles.item,
                          {
                            backgroundColor: bgColor,
                            borderColor: active ? theme.colors.primary : "transparent",
                          },
                          active && styles.itemActive,
                        ]}
                        onPress={() => handleItemPress(item)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={item.label}
                      >
                        <Ionicons name={item.icon} size={20} color={iconColor} />
                        {!collapsed && (
                          <>
                            <Text
                              style={[
                                styles.itemLabel,
                                {
                                  color: active ? theme.colors.primary : theme.colors.text,
                                },
                              ]}
                            >
                              {item.label}
                            </Text>
                            {item.badge !== undefined && item.badge > 0 && (
                              <View
                                style={[styles.itemBadge, { backgroundColor: theme.colors.error }]}
                              >
                                <Text style={styles.itemBadgeText}>
                                  {item.badge > 99 ? "99+" : item.badge}
                                </Text>
                              </View>
                            )}
                          </>
                        )}
                      </AppTouchable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      {/* Logout Button */}
      {!collapsed && (
        <AppTouchable
          style={[
            styles.logoutButton,
            {
              borderTopColor: subtleBorder,
              backgroundColor: panelBackground,
            },
          ]}
          onPress={handleLogout}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Logout"
        >
          <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
          <Text style={[styles.logoutLabel, { color: theme.colors.error }]}>Logout</Text>
        </AppTouchable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: "100%",
    borderRightWidth: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.sm,
    gap: spacing.sm,
  },
  brandSection: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderRadius: 16,
    gap: spacing.sm,
  },
  brandBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  brandCopy: {
    flex: 1,
  },
  brandTitle: {
    ...typography.bodyMedium,
    fontWeight: "700",
  },
  brandSubtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  collapseButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderRadius: 16,
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(76, 175, 80, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    ...typography.bodyMedium,
    fontWeight: "600",
  },
  profileRole: {
    ...typography.caption,
    marginTop: 2,
  },
  group: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  groupTitle: {
    ...typography.overline,
    fontSize: 11,
  },
  groupItems: {
    paddingVertical: spacing.xs,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.xs,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.sm,
  },
  itemActive: {
    // Active state handled by backgroundColor and borderColor
  },
  itemLabel: {
    ...typography.bodySmall,
    flex: 1,
  },
  itemBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  itemBadgeText: {
    color: uiSemanticColors.text.inverse,
    fontSize: 9,
    fontWeight: "bold",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderTopWidth: 1,
    margin: spacing.sm,
    borderRadius: 16,
    gap: spacing.sm,
  },
  logoutLabel: {
    ...typography.bodySmall,
    fontWeight: "600",
  },
});
