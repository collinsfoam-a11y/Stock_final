/**
 * @deprecated Use `usePermission` from `./usePermission`.
 * Legacy proxy maintained for backward compatibility.
 */

import { Permission, Role, ROLE_PERMISSIONS } from "@/constants/permissions";
import { usePermission } from "./usePermission";

export const Permissions = {
  SESSION_CREATE: Permission.SESSION_CREATE,
  SESSION_READ: Permission.SESSION_READ,
  SESSION_READ_ALL: Permission.SESSION_READ_ALL,
  SESSION_UPDATE: Permission.SESSION_UPDATE,
  SESSION_DELETE: Permission.SESSION_DELETE,
  SESSION_CLOSE: Permission.SESSION_CLOSE,
  COUNT_LINE_CREATE: Permission.COUNT_LINE_CREATE,
  COUNT_LINE_READ: Permission.COUNT_LINE_READ,
  COUNT_LINE_UPDATE: Permission.COUNT_LINE_UPDATE,
  COUNT_LINE_DELETE: Permission.COUNT_LINE_DELETE,
  COUNT_LINE_APPROVE: Permission.COUNT_LINE_APPROVE,
  COUNT_LINE_REJECT: Permission.COUNT_LINE_REJECT,
  ITEM_READ: Permission.ITEM_READ,
  ITEM_SEARCH: Permission.ITEM_SEARCH,
  MRP_UPDATE: Permission.MRP_UPDATE,
  MRP_BULK_UPDATE: Permission.MRP_BULK_UPDATE,
  EXPORT_OWN: Permission.EXPORT_OWN,
  EXPORT_ALL: Permission.EXPORT_ALL,
  EXPORT_SCHEDULE: Permission.EXPORT_SCHEDULE,
  ACTIVITY_LOG_READ: Permission.ACTIVITY_LOG_READ,
  ERROR_LOG_READ: Permission.ERROR_LOG_READ,
  USER_MANAGE: Permission.USER_MANAGE,
  SETTINGS_MANAGE: Permission.SETTINGS_MANAGE,
  DB_MAPPING_MANAGE: Permission.DB_MAPPING_MANAGE,
  SYNC_TRIGGER: Permission.SYNC_TRIGGER,
  SYNC_RESOLVE_CONFLICT: Permission.SYNC_RESOLVE_CONFLICT,
  REVIEW_CREATE: Permission.REVIEW_CREATE,
  REVIEW_APPROVE: Permission.REVIEW_APPROVE,
  REVIEW_COMMENT: Permission.REVIEW_COMMENT,
  REPORT_VIEW: Permission.REPORT_VIEW,
  REPORT_FINANCIAL: Permission.REPORT_FINANCIAL,
  REPORT_ANALYTICS: Permission.REPORT_ANALYTICS,
} as const;

const LEGACY_ROLE_PERMISSIONS: Record<string, string[]> = {
  [Role.STAFF]: ROLE_PERMISSIONS[Role.STAFF].map(String),
  [Role.SUPERVISOR]: ROLE_PERMISSIONS[Role.SUPERVISOR].map(String),
  [Role.ADMIN]: ["*"],
};

export function usePermissions() {
  const permission = usePermission();

  const hasPermission = (requiredPermission: string): boolean =>
    permission.hasPermission(requiredPermission);

  const hasAnyPermission = (...requiredPermissions: string[]): boolean =>
    permission.hasAnyPermission(requiredPermissions);

  const hasAllPermissions = (...requiredPermissions: string[]): boolean =>
    permission.hasAllPermissions(requiredPermissions);

  const hasRole = (...roles: string[]): boolean => permission.hasAnyRole(roles);

  const isAdmin = (): boolean => permission.role === Role.ADMIN;

  const isSupervisor = (): boolean =>
    permission.role === Role.SUPERVISOR || permission.role === Role.ADMIN;

  const isStaff = (): boolean => permission.role === Role.STAFF;

  return {
    user: permission.user,
    role: permission.role,
    permissions: permission.permissions,
    rolePermissions: LEGACY_ROLE_PERMISSIONS,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    isAdmin,
    isSupervisor,
    isStaff,
  };
}

