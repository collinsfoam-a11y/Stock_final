import { useCallback, useMemo } from "react";
import { useAuthStore } from "../store/authStore";
import { Permission, Role } from "../constants/permissions";

const EMPTY_PERMISSIONS: string[] = [];

/**
 * Custom hook for permission-based access control
 * Provides methods to check if current user has specific permissions
 */
export const usePermission = () => {
  const user = useAuthStore((state) => state.user);
  const permissions = user?.permissions ?? EMPTY_PERMISSIONS;
  const role = user?.role ?? "";

  /**
   * Check if user has a specific permission
   * @param permission - Permission string or enum to check
   * @returns true if user has the permission
   */
  const hasPermission = useCallback(
    (permission: Permission | string): boolean => {
      return permissions.includes(permission as string);
    },
    [permissions],
  );

  /**
   * Check if user has any of the specified permissions
   * @param permissions - Array of permission strings or enums
   * @returns true if user has at least one permission
   */
  const hasAnyPermission = useCallback(
    (requiredPermissions: (Permission | string)[]): boolean => {
      return requiredPermissions.some((permission) =>
        permissions.includes(permission as string),
      );
    },
    [permissions],
  );

  /**
   * Check if user has all of the specified permissions
   * @param permissions - Array of permission strings or enums
   * @returns true if user has all permissions
   */
  const hasAllPermissions = useCallback(
    (requiredPermissions: (Permission | string)[]): boolean => {
      return requiredPermissions.every((permission) =>
        permissions.includes(permission as string),
      );
    },
    [permissions],
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
