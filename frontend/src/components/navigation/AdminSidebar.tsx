/**
 * AdminSidebar Component - Extended sidebar for admin role
 * Includes all supervisor sections plus admin-specific sections
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
  ViewStyle,
  Linking,
} from "react-native";
import { BlurView } from "expo-blur";
import { useRouter, useSegments } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../../hooks/useTheme";
import { useAuthStore } from "../../store/authStore";
import {
  layout,
  spacing,
  typography,
  breakpoints,
} from "../../styles/globalStyles";
import { ADMIN_NAV_GROUPS, AdminNavItem } from "./adminNavShared";

interface AdminSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  style?: ViewStyle;
  testID?: string;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
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

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(ADMIN_NAV_GROUPS.map((group) => group.title)),
  );

  const currentRoute = segments.join("/");
  const isActive = (route: string) => {
    const routePath = route.replace(/^\//, "");
    return (
      currentRoute === routePath || currentRoute.startsWith(routePath + "/")
    );
  };

  const handleItemPress = (item: AdminNavItem) => {
    if (item.route.startsWith("http")) {
      Linking.openURL(item.route);
      return;
    }
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

  const sidebarWidth = collapsed
    ? layout.sidebarCollapsedWidth
    : layout.sidebarWidth;
  const panelBackground = theme.colors.surfaceElevated || theme.colors.surface;
  const subtleBorder = theme.colors.borderLight || theme.colors.border;
  const activeBackground =
    theme.colors.overlayPrimary || "rgba(76, 175, 80, 0.14)";

  if (isMobile && !collapsed) {
    return null;
  }

  return (
    <View style={[styles.outerContainer, { width: sidebarWidth }]}>
      <BlurView
        intensity={collapsed ? 0 : 40}
        tint="dark"
        style={[
          styles.container,
          {
            width: sidebarWidth,
            backgroundColor: collapsed
              ? theme.colors.surface
              : "rgba(10, 10, 10, 0.4)",
            borderRightColor: "rgba(255, 255, 255, 0.1)",
          },
          style,
        ]}
        testID={testID}
      >
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.brandSection,
              {
                borderBottomColor: subtleBorder,
                backgroundColor: panelBackground,
              },
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
                <Text style={[styles.brandTitle, { color: theme.colors.text }]}>
                  Admin Control
                </Text>
                <Text
                  style={[
                    styles.brandSubtitle,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  System oversight and control
                </Text>
              </View>
            )}

            {onToggleCollapse && (
              <TouchableOpacity
                style={[
                  styles.collapseButton,
                  { backgroundColor: activeBackground, borderColor: subtleBorder },
                ]}
                onPress={onToggleCollapse}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={
                  collapsed ? "Expand admin sidebar" : "Collapse admin sidebar"
                }
              >
                <Ionicons
                  name={
                    collapsed ? "chevron-forward-outline" : "chevron-back-outline"
                  }
                  size={18}
                  color={theme.colors.text}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* User Profile Section */}
          {!collapsed && (
            <View
              style={[
                styles.profileSection,
                { borderBottomColor: theme.colors.border },
              ]}
            >
              <View style={styles.profileAvatar}>
                <Ionicons
                  name="person"
                  size={24}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.profileInfo}>
                <Text
                  style={[styles.profileName, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  {user?.full_name || "Admin"}
                </Text>
                <Text
                  style={[
                    styles.profileRole,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  Administrator
                </Text>
              </View>
            </View>
          )}

          {/* Navigation Groups */}
          {ADMIN_NAV_GROUPS.map((group) => {
            const isExpanded = expandedGroups.has(group.title);

            return (
              <View key={group.title} style={styles.group}>
                {!collapsed && (
                  <TouchableOpacity
                    style={styles.groupHeader}
                    onPress={() => toggleGroup(group.title)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.groupTitle,
                        { color: theme.colors.textSecondary },
                      ]}
                    >
                      {group.title}
                    </Text>
                    <Ionicons
                      name={isExpanded ? "chevron-down" : "chevron-forward"}
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                  </TouchableOpacity>
                )}

                {(!collapsed && isExpanded) || collapsed ? (
                  <View style={styles.groupItems}>
                    {group.items.map((item) => {
                      const active = isActive(item.route);
                      const iconColor = active
                        ? theme.colors.primary
                        : theme.colors.textSecondary;
                      const bgColor = active
                        ? theme.colors.overlayPrimary ||
                        "rgba(76, 175, 80, 0.1)"
                        : "transparent";

                      return (
                        <TouchableOpacity
                          key={item.key}
                          style={[
                            styles.item,
                            { backgroundColor: bgColor },
                            active && styles.itemActive,
                          ]}
                          onPress={() => handleItemPress(item)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={item.label}
                        >
                          <Ionicons
                            name={item.icon}
                            size={20}
                            color={iconColor}
                          />
                          {!collapsed && (
                            <>
                              <Text
                                style={[
                                  styles.itemLabel,
                                  {
                                    color: active
                                      ? theme.colors.primary
                                      : theme.colors.text,
                                  },
                                ]}
                              >
                                {item.label}
                              </Text>
                              {item.badge !== undefined && item.badge > 0 && (
                                <View
                                  style={[
                                    styles.itemBadge,
                                    { backgroundColor: theme.colors.error },
                                  ]}
                                >
                                  <Text style={styles.itemBadgeText}>
                                    {item.badge > 99 ? "99+" : item.badge}
                                  </Text>
                                </View>
                              )}
                            </>
                          )}
                        </TouchableOpacity>
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
          <TouchableOpacity
            style={[
              styles.logoutButton,
              { borderTopColor: theme.colors.border },
            ]}
            onPress={handleLogout}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Logout"
          >
            <Ionicons
              name="log-out-outline"
              size={20}
              color={theme.colors.error}
            />
            <Text style={[styles.logoutLabel, { color: theme.colors.error }]}>
              Logout
            </Text>
          </TouchableOpacity>
        )}
      </BlurView>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    height: "100%",
    flexShrink: 0,
    zIndex: 100,
  },
  container: {
    height: "100%",
    borderRightWidth: 1,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? {
        position: "fixed" as const,
        left: 0,
        top: 0,
        bottom: 0,
      }
      : {}),
  } as any,
  scrollView: {
    flex: 1,
  },
  brandSection: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderRadius: 16,
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
    marginBottom: spacing.sm,
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
    marginBottom: spacing.sm,
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
    borderRadius: 8,
    gap: spacing.sm,
  },
  itemActive: {
    // Active state handled by backgroundColor
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
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "bold",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  logoutLabel: {
    ...typography.bodySmall,
    fontWeight: "600",
  },
});
