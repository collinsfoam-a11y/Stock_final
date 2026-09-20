/**
 * SupervisorSidebar Component - Persistent sidebar for supervisor role
 */

import React from "react";
import { ViewStyle } from "react-native";
import { BaseSidebar } from "./BaseSidebar";
import { SUPERVISOR_NAV_GROUPS } from "./supervisorNavShared";

interface SupervisorSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  style?: ViewStyle;
  testID?: string;
}

export const SupervisorSidebar: React.FC<SupervisorSidebarProps> = (props) => {
  return (
    <BaseSidebar
      brandTitle="Supervisor Hub"
      brandSubtitle="Daily operations made simple"
      groups={SUPERVISOR_NAV_GROUPS}
      {...props}
    />
  );
};
