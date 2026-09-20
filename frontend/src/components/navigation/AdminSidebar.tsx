/**
 * AdminSidebar Component - Persistent sidebar for admin role
 */

import React from "react";
import { ViewStyle, Linking } from "react-native";
import { useRouter } from "expo-router";
import { BaseSidebar, BaseNavItem } from "./BaseSidebar";
import { ADMIN_NAV_GROUPS } from "./adminNavShared";

interface AdminSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  style?: ViewStyle;
  testID?: string;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = (props) => {
  const router = useRouter();

  const handleItemPress = (item: BaseNavItem) => {
    if (item.route.startsWith("http")) {
      Linking.openURL(item.route);
      return;
    }
    router.push(item.route as any);
  };

  return (
    <BaseSidebar
      brandTitle="Admin Control"
      brandSubtitle="System oversight and control"
      groups={ADMIN_NAV_GROUPS}
      useBlur={true}
      onItemPress={handleItemPress}
      {...props}
    />
  );
};
