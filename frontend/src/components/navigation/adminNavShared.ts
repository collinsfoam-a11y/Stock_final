import Ionicons from "@expo/vector-icons/Ionicons";
import {
  supervisorFeatureFlags,
} from "../../constants/roleFeatureFlags";

export interface AdminNavItem {
  key: string;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  badge?: number;
}

export interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        key: "dashboard",
        label: "Admin Home",
        subtitle: "Daily system status and top priorities",
        icon: "grid",
        route: "/admin/dashboard-web",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        key: "sessions",
        label: "Count Sessions",
        subtitle: "Track active and completed stock counts",
        icon: "cube",
        route: "/supervisor/sessions",
      },
      {
        key: "variances",
        label: "Count Differences",
        subtitle: "Approve differences or assign recounts",
        icon: "alert-circle",
        route: "/supervisor/variances",
      },
      {
        key: "user-workflows",
        label: "Team Activity",
        subtitle: "See who is working and where delays happen",
        icon: "git-network",
        route: "/supervisor/user-workflows",
      },
      ...(supervisorFeatureFlags.offlineQueue
        ? [
            {
              key: "offline-queue",
              label: "Pending Uploads",
              subtitle: "Review updates waiting for upload",
              icon: "cloud-offline",
              route: "/supervisor/offline-queue",
            } satisfies AdminNavItem,
          ]
        : []),
      ...(supervisorFeatureFlags.syncConflicts
        ? [
            {
              key: "sync-conflicts",
              label: "Sync Issues",
              subtitle: "Resolve data mismatches before they spread",
              icon: "sync",
              route: "/supervisor/sync-conflicts",
            } satisfies AdminNavItem,
          ]
        : []),
    ],
  },
  {
    title: "Access Control",
    items: [
      {
        key: "users",
        label: "User Accounts",
        subtitle: "Manage access and account status",
        icon: "people",
        route: "/admin/users",
      },
      {
        key: "permissions",
        label: "Access Rules",
        subtitle: "Control what each role can do",
        icon: "shield",
        route: "/admin/permissions",
      },
      {
        key: "security",
        label: "Security Review",
        subtitle: "Check login risks and security signals",
        icon: "lock-closed",
        route: "/admin/security",
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        key: "realtime-dashboard",
        label: "Live Operations",
        subtitle: "Watch live counting activity",
        icon: "pulse",
        route: "/admin/realtime-dashboard",
      },
      {
        key: "unknown-items",
        label: "Unmapped Items",
        subtitle: "Fix items that could not be matched",
        icon: "help-circle-outline",
        route: "/admin/unknown-items",
      },
      {
        key: "sql-config",
        label: "ERP Connection",
        subtitle: "Configure and test ERP connection settings",
        icon: "server",
        route: "/admin/sql-config",
      },
      {
        key: "logs",
        label: "System History",
        subtitle: "Review backend activity and events",
        icon: "journal",
        route: "/admin/logs",
      },
      {
        key: "settings",
        label: "Preferences",
        subtitle: "Adjust platform and personal settings",
        icon: "settings",
        route: "/admin/settings",
      },
    ],
  },
];
