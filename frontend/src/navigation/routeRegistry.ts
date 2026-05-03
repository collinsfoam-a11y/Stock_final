export type UserRole = "staff" | "supervisor" | "admin";

export const roleHomeRoutes: Record<UserRole, string> = {
  staff: "/staff/home",
  supervisor: "/supervisor/dashboard",
  admin: "/admin/dashboard-web",
};

const routeAccessPrefixes: { prefix: string; allowed: UserRole[] }[] = [
  { prefix: "/admin", allowed: ["admin"] },
  { prefix: "/supervisor", allowed: ["supervisor", "admin"] },
  { prefix: "/staff", allowed: ["staff"] },
];

export const supervisorFeatureFlags = {
  activityLogs: true,
  offlineQueue: true,
  syncConflicts: true,
  variances: true,
} as const;

const SUPERVISOR_ROUTE_ENABLED: Record<string, boolean> = {
  "activity-logs": supervisorFeatureFlags.activityLogs,
  "offline-queue": supervisorFeatureFlags.offlineQueue,
  "sync-conflicts": supervisorFeatureFlags.syncConflicts,
  variances: supervisorFeatureFlags.variances,
};

const HARD_DISABLED_SUPERVISOR_ROUTE_SEGMENTS = new Set([
  "db-mapping",
  "error-logs",
  "export",
  "export-results",
  "export-schedules",
  "notes",
  "watchtower",
]);

const HARD_DISABLED_ADMIN_ROUTE_SEGMENTS = new Set(["ai-assistant"]);
const ADMIN_ROUTE_ENABLED: Record<string, boolean> = {};

export const SUPERVISOR_OFFLINE_BLOCKED_ROUTES = new Set([
  "activity-logs",
  "dashboard",
  "sync-conflicts",
  "user-workflows",
]);

export const SUPERVISOR_OFFLINE_ROUTE_LABELS: Record<string, string> = {
  "activity-logs": "Activity Logs",
  dashboard: "Dashboard",
  session: "Session Details",
  sessions: "Sessions",
  "sync-conflicts": "Sync Differences",
  "user-workflows": "User Workflows",
};

export const SUPERVISOR_OFFLINE_SAFE_LINKS = [
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

export const getRouteForRole = (role: UserRole): string => {
  return roleHomeRoutes[role] || "/welcome";
};

export const isRouteAllowedForRole = (route: string, role: UserRole): boolean => {
  for (const access of routeAccessPrefixes) {
    if (route.startsWith(access.prefix)) {
      return access.allowed.includes(role);
    }
  }
  return true;
};

export function isSupervisorRouteEnabled(routeSegment?: string): boolean {
  if (!routeSegment) {
    return true;
  }
  if (HARD_DISABLED_SUPERVISOR_ROUTE_SEGMENTS.has(routeSegment)) {
    return false;
  }
  return SUPERVISOR_ROUTE_ENABLED[routeSegment] !== false;
}

export function isAdminRouteEnabled(routeSegment?: string): boolean {
  if (!routeSegment) {
    return true;
  }
  if (HARD_DISABLED_ADMIN_ROUTE_SEGMENTS.has(routeSegment)) {
    return false;
  }
  return ADMIN_ROUTE_ENABLED[routeSegment] !== false;
}
