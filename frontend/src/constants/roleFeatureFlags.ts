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
