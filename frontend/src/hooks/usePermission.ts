import { useCallback, useMemo } from "react";
import { useAuthStore } from "../store/authStore";
import { Permission, Role } from "../constants/permissions";
import {
  hasPermissionInPolicy,
  normalizeRole,
  resolveEffectivePermissions,
} from "../core/permissions/permissionPolicy";

const EMPTY_PERMISSIONS: string[] = [];

/**
 * Custom hook for permission-based access control
 * Provides methods to check if current user has specific permissions
 */
export const usePermission = () => {
  const user = useAuthStore((state) => state.user);
  const role = normalizeRole(user?.role);
  const permissions = useMemo(
    () =>
      resolveEffectivePermissions({
        role,
        explicitPermissions: user?.permissions ?? EMPTY_PERMISSIONS,
      }),
    [role, user?.permissions],
  );

  /**
   * Check if user has a specific permission
   * @param permission - Permission string or enum to check
   * @returns true if user has the permission
   */
  const hasPermission = useCallback(
    (permission: Permission | string): boolean => {
      return hasPermissionInPolicy(
        {
          role,
          explicitPermissions: permissions,
        },
        permission,
      );
    },
    [permissions, role],
  );

  /**
   * Check if user has any of the specified permissions
   * @param permissions - Array of permission strings or enums
   * @returns true if user has at least one permission
   */
  const hasAnyPermission = useCallback(
    (requiredPermissions: (Permission | string)[]): boolean => {
      return requiredPermissions.some((permission) => hasPermission(permission));
    },
    [hasPermission],
  );

  /**
   * Check if user has all of the specified permissions
   * @param permissions - Array of permission strings or enums
   * @returns true if user has all permissions
   */
  const hasAllPermissions = useCallback(
    (requiredPermissions: (Permission | string)[]): boolean => {
      return requiredPermissions.every((permission) => hasPermission(permission));
    },
    [hasPermission],
  );

  /**
   * Check if user has a specific role
   * @param role - Role to check
   * @returns true if user has the role
   */
  const hasRole = useCallback(
    (requiredRole: Role | string): boolean => {
      return role === (requiredRole as string);
    },
    [role],
  );

  /**
   * Check if user has any of the specified roles
   * @param roles - Array of role strings or enums
   * @returns true if user has at least one role
   */
  const hasAnyRole = useCallback(
    (roles: (Role | string)[]): boolean => {
      return roles.includes(role as Role);
    },
    [role],
  );

  return useMemo(
    () => ({
      user,
      permissions,
      role,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      hasRole,
      hasAnyRole,
      isAdmin: role === Role.ADMIN,
    }),
    [
      user,
      permissions,
      role,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      hasRole,
      hasAnyRole,
    ],
  );
};
