import Ionicons from "@expo/vector-icons/Ionicons";
import { supervisorFeatureFlags } from "../../constants/roleFeatureFlags";

export interface SupervisorNavItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  badge?: number;
}

export interface SupervisorNavGroup {
  title: string;
  items: SupervisorNavItem[];
}

/**
 * Single source of truth for supervisor navigation. Consumed by both the web
 * SupervisorSidebar and the mobile MobileNavDrawer so the two never drift.
 */
export const SUPERVISOR_NAV_GROUPS: SupervisorNavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        key: "dashboard",
        label: "Today",
        icon: "grid",
        route: "/supervisor/dashboard",
      },
      {
        key: "sessions",
        label: "Count Sessions",
        icon: "cube",
        route: "/supervisor/sessions",
      },
      {
        key: "variances",
        label: "Count Differences",
        icon: "alert-circle",
        route: "/supervisor/variances",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        key: "user-workflows",
        label: "Team Activity",
        icon: "git-network",
        route: "/supervisor/user-workflows",
      },
      {
        key: "approval-queue",
        label: "Approval Queue",
        icon: "checkmark-circle",
        route: "/supervisor/approval-queue",
      },
      ...(supervisorFeatureFlags.activityLogs
        ? [
            {
              key: "activity-logs",
              label: "Activity History",
              icon: "list",
              route: "/supervisor/activity-logs",
            } satisfies SupervisorNavItem,
          ]
        : []),
      ...(supervisorFeatureFlags.offlineQueue
        ? [
            {
              key: "offline-queue",
              label: "Pending Uploads",
              icon: "cloud-offline",
              route: "/supervisor/offline-queue",
            } satisfies SupervisorNavItem,
          ]
        : []),
      ...(supervisorFeatureFlags.syncConflicts
        ? [
            {
              key: "sync-conflicts",
              label: "Sync Issues",
              icon: "sync",
              route: "/supervisor/sync-conflicts",
            } satisfies SupervisorNavItem,
          ]
        : []),
    ],
  },
  {
    title: "Settings",
    items: [
      {
        key: "settings",
        label: "Preferences",
        icon: "settings",
        route: "/supervisor/settings",
      },
    ],
  },
];
