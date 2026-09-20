/**
 * BaseSidebar Component - Foundational sidebar layout for Admin and Supervisor sidebars.
 * Provides unified theme styling, section collapsible groups, accessible buttons, and haptic feedback.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
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
import { layout, spacing, typography, breakpoints } from "../../styles/globalStyles";
import { radius, semanticColors as uiSemanticColors, spacing as unifiedSpacing } from "@/theme/unified";
import { AppTouchable } from "@/components/ui/AppTouchable";
import { haptics } from "@/services/haptics";
import { getAccessibleButtonProps, getDecorativeIconProps } from "@/utils/accessibility";

export interface BaseNavItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  badge?: number;
}

export interface BaseNavGroup {
  title: string;
  items: BaseNavItem[];
}

export interface BaseSidebarProps {
  brandTitle: string;
  brandSubtitle: string;
  groups: BaseNavGroup[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  useBlur?: boolean;
  style?: ViewStyle;
  testID?: string;
  onItemPress?: (item: BaseNavItem) => void;
}

export const BaseSidebar: React.FC<BaseSidebarProps> = ({
  brandTitle,
  brandSubtitle,
  groups,
  collapsed = false,
  onToggleCollapse,
  useBlur = false,
  style,
  testID,
  onItemPress,
}) => {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const { user, logout } = useAuthStore();
  const { width } = useWindowDimensions();
  const isMobile = width < breakpoints.tablet;

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(groups.map((g) => g.title))
  );

  const currentRoute = segments.join("/");
  const isActive = (route: string) => {
    const routePath = route.replace(/^\//, "");
    return currentRoute === routePath || currentRoute.startsWith(routePath + "/");
  };

  const handleItemPress = (item: BaseNavItem) => {
    void haptics.light();
    if (onItemPress) {
      onItemPress(item);
      return;
    }
    if (item.route.startsWith("http")) {
      Linking.openURL(item.route);
      return;
    }
    router.push(item.route as any);
  };

  const handleLogout = async () => {
    void haptics.light();
    await logout();
  };

  const toggleGroup = (title: string) => {
    void haptics.light();
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
    return null;
  }

  const renderContent = () => (
    <>
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
              {...getDecorativeIconProps()}
            />
          </View>

          {!collapsed && (
            <View style={styles.brandCopy}>
              <Text style={[styles.brandTitle, { color: theme.colors.text }]}>{brandTitle}</Text>
              <Text style={[styles.brandSubtitle, { color: theme.colors.textSecondary }]}>
                {brandSubtitle}
              </Text>
            </View>
          )}

          {onToggleCollapse && (
            <AppTouchable
              style={[
                styles.collapseButton,
                { backgroundColor: activeBackground, borderColor: subtleBorder },
              ]}
              onPress={() => {
                void haptics.light();
                onToggleCollapse();
              }}
              activeOpacity={0.7}
              {...getAccessibleButtonProps({
                label: collapsed ? `Expand ${brandTitle.toLowerCase()}` : `Collapse ${brandTitle.toLowerCase()}`,
              })}
            >
              <Ionicons
                name={collapsed ? "chevron-forward-outline" : "chevron-back-outline"}
                size={18}
                color={theme.colors.text}
                {...getDecorativeIconProps()}
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
              <Ionicons name="person" size={24} color={theme.colors.primary} {...getDecorativeIconProps()} />
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
        {groups.map((group) => {
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
                  {...getAccessibleButtonProps({
                    label: `${group.title} section`,
                    expanded: isExpanded,
                  })}
                >
                  <Text style={[styles.groupTitle, { color: theme.colors.textSecondary }]}>
                    {group.title}
                  </Text>
                  <Ionicons
                    name={isExpanded ? "chevron-down" : "chevron-forward"}
                    size={16}
                    color={theme.colors.textSecondary}
                    {...getDecorativeIconProps()}
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
                        {...getAccessibleButtonProps({
                          label: item.label,
                          selected: active,
                        })}
                      >
                        <Ionicons name={item.icon} size={20} color={iconColor} {...getDecorativeIconProps()} />
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
          {...getAccessibleButtonProps({
            label: "Logout",
          })}
        >
          <Ionicons name="log-out-outline" size={20} color={theme.colors.error} {...getDecorativeIconProps()} />
          <Text style={[styles.logoutLabel, { color: theme.colors.error }]}>Logout</Text>
        </AppTouchable>
      )}
    </>
  );

  if (useBlur) {
    return (
      <View style={[styles.outerContainer, { width: sidebarWidth }]}>
        <BlurView
          intensity={collapsed ? 0 : 40}
          tint="dark"
          style={[
            styles.blurContainer,
            {
              width: sidebarWidth,
              backgroundColor: collapsed ? theme.colors.surface : "rgba(10, 10, 10, 0.4)",
              borderRightColor: "rgba(255, 255, 255, 0.1)",
            },
            style,
          ]}
          testID={testID}
        >
          {renderContent()}
        </BlurView>
      </View>
    );
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
      {renderContent()}
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
  },
  blurContainer: {
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
  scrollContent: {
    padding: spacing.sm,
    gap: spacing.sm,
  },
  brandSection: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderRadius: radius.xl,
    gap: spacing.sm,
  },
  brandBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
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
    borderRadius: radius.lg,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderRadius: radius.xl,
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
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
    borderRadius: radius.xl,
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
    borderRadius: radius.lg,
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
    borderRadius: radius.full,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: unifiedSpacing.xs,
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
    borderRadius: radius.xl,
    gap: spacing.sm,
  },
  logoutLabel: {
    ...typography.bodySmall,
    fontWeight: "600",
  },
});
