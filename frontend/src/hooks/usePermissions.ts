/**
 * Permission Hook - Check user permissions in React Native components
 *
 * Usage:
 *   const { hasPermission, hasRole, user } = usePermissions();
 *
 *   if (hasPermission('count:approve')) {
 *     // Show approve button
 *   }
 *
 *   if (hasRole('admin', 'supervisor')) {
 *     // Show admin features
 *   }
 */

import { useAuthStore, AuthState } from "@/store/authStore";

// Permission definitions (must match backend)
export const Permissions = {
  // Session permissions
  SESSION_CREATE: "session.create",
  SESSION_READ: "session.read",
  SESSION_READ_ALL: "session.read_all",
  SESSION_UPDATE: "session.update",
  SESSION_DELETE: "session.delete",
  SESSION_CLOSE: "session.close",

  // Count line permissions
  COUNT_LINE_CREATE: "count_line.create",
  COUNT_LINE_READ: "count_line.read",
  COUNT_LINE_UPDATE: "count_line.update",
  COUNT_LINE_DELETE: "count_line.delete",
  COUNT_LINE_APPROVE: "count_line.approve",
  COUNT_LINE_REJECT: "count_line.reject",

  // Item/MRP permissions
  ITEM_READ: "item.read",
  ITEM_SEARCH: "item.search",
  MRP_UPDATE: "mrp.update",
  MRP_BULK_UPDATE: "mrp.bulk_update",

  // Export permissions
  EXPORT_OWN: "export.own",
  EXPORT_ALL: "export.all",
  EXPORT_SCHEDULE: "export.schedule",

  // Log permissions
  ACTIVITY_LOG_READ: "activity_log.read",
  ERROR_LOG_READ: "error_log.read",

  // Admin permissions
  USER_MANAGE: "user.manage",
  SETTINGS_MANAGE: "settings.manage",
  DB_MAPPING_MANAGE: "db_mapping.manage",

  // Sync permissions
  SYNC_TRIGGER: "sync.trigger",
  SYNC_RESOLVE_CONFLICT: "sync.resolve_conflict",

  // Review permissions
  REVIEW_CREATE: "review.create",
  REVIEW_APPROVE: "review.approve",
  REVIEW_COMMENT: "review.comment",

  // Reporting permissions
  REPORT_VIEW: "report.view",
  REPORT_FINANCIAL: "report.financial",
  REPORT_ANALYTICS: "report.analytics",
} as const;

// Role to permission mapping (must match backend)
const ROLE_PERMISSIONS: Record<string, string[]> = {
  staff: [
    Permissions.SESSION_CREATE,
    Permissions.SESSION_READ,
    Permissions.SESSION_UPDATE,
    Permissions.SESSION_CLOSE,
    Permissions.COUNT_LINE_CREATE,
    Permissions.COUNT_LINE_READ,
    Permissions.COUNT_LINE_UPDATE,
    Permissions.ITEM_READ,
    Permissions.ITEM_SEARCH,
    Permissions.MRP_UPDATE,
    Permissions.EXPORT_OWN,
    Permissions.REVIEW_CREATE,
    Permissions.REVIEW_COMMENT,
  ],
  supervisor: [
    Permissions.SESSION_CREATE,
    Permissions.SESSION_READ,
    Permissions.SESSION_READ_ALL,
    Permissions.SESSION_UPDATE,
    Permissions.SESSION_DELETE,
    Permissions.SESSION_CLOSE,
    Permissions.COUNT_LINE_CREATE,
    Permissions.COUNT_LINE_READ,
    Permissions.COUNT_LINE_UPDATE,
    Permissions.COUNT_LINE_DELETE,
    Permissions.COUNT_LINE_APPROVE,
    Permissions.COUNT_LINE_REJECT,
    Permissions.ITEM_READ,
    Permissions.ITEM_SEARCH,
    Permissions.MRP_UPDATE,
    Permissions.MRP_BULK_UPDATE,
    Permissions.EXPORT_OWN,
    Permissions.EXPORT_ALL,
    Permissions.EXPORT_SCHEDULE,
    Permissions.ACTIVITY_LOG_READ,
    Permissions.ERROR_LOG_READ,
    Permissions.DB_MAPPING_MANAGE,
    Permissions.SYNC_TRIGGER,
    Permissions.SYNC_RESOLVE_CONFLICT,
    Permissions.REVIEW_CREATE,
    Permissions.REVIEW_APPROVE,
    Permissions.REVIEW_COMMENT,
    Permissions.REPORT_VIEW,
    Permissions.REPORT_FINANCIAL,
    Permissions.REPORT_ANALYTICS,
  ],
  admin: ["*"], // All permissions
};

export function usePermissions() {
  const user = useAuthStore((state: AuthState) => state.user);

  /**
   * Check if user has a specific permission
   */
  const hasPermission = (permission: string): boolean => {
    if (!user) return false;

    const role = user.role || "staff";
    const userPermissions = ROLE_PERMISSIONS[role] || [];

    // Admin has all permissions
    if (userPermissions.includes("*")) return true;

    // Check if permission is in user's role permissions
    return userPermissions.includes(permission);
  };

  /**
   * Check if user has ANY of the specified permissions
   */
  const hasAnyPermission = (...permissions: string[]): boolean => {
    return permissions.some((permission) => hasPermission(permission));
  };

  /**
   * Check if user has ALL of the specified permissions
   */
  const hasAllPermissions = (...permissions: string[]): boolean => {
    return permissions.every((permission) => hasPermission(permission));
  };

  /**
   * Check if user has a specific role
   */
  const hasRole = (...roles: string[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role || "staff");
  };

  /**
   * Check if user is admin
   */
  const isAdmin = (): boolean => {
    return hasRole("admin");
  };

  /**
   * Check if user is supervisor or admin
   */
  const isSupervisor = (): boolean => {
    return hasRole("supervisor", "admin");
  };

  /**
   * Check if user is staff (not supervisor or admin)
   */
  const isStaff = (): boolean => {
    return hasRole("staff") && !isSupervisor();
  };

  return {
    user,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    isAdmin,
    isSupervisor,
    isStaff,
  };
}
