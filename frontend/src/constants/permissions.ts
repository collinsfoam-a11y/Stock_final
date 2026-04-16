/**
 * Permission constants for Role-Based Access Control (RBAC).
 *
 * Must match `backend/auth/permissions.py` Permission values.
 */
export enum Permission {
  // Session
  SESSION_CREATE = "session.create",
  SESSION_READ = "session.read",
  SESSION_READ_ALL = "session.read_all",
  SESSION_UPDATE = "session.update",
  SESSION_DELETE = "session.delete",
  SESSION_CLOSE = "session.close",

  // Count lines
  COUNT_LINE_CREATE = "count_line.create",
  COUNT_LINE_READ = "count_line.read",
  COUNT_LINE_UPDATE = "count_line.update",
  COUNT_LINE_DELETE = "count_line.delete",
  COUNT_LINE_APPROVE = "count_line.approve",
  COUNT_LINE_REJECT = "count_line.reject",

  // Item / MRP
  ITEM_READ = "item.read",
  ITEM_SEARCH = "item.search",
  MRP_UPDATE = "mrp.update",
  MRP_BULK_UPDATE = "mrp.bulk_update",

  // Export
  EXPORT_OWN = "export.own",
  EXPORT_ALL = "export.all",
  EXPORT_SCHEDULE = "export.schedule",

  // Logs
  ACTIVITY_LOG_READ = "activity_log.read",
  ERROR_LOG_READ = "error_log.read",

  // Admin
  USER_MANAGE = "user.manage",
  SETTINGS_MANAGE = "settings.manage",
  DB_MAPPING_MANAGE = "db_mapping.manage",

  // Sync
  SYNC_TRIGGER = "sync.trigger",
  SYNC_RESOLVE_CONFLICT = "sync.resolve_conflict",

  // Review
  REVIEW_CREATE = "review.create",
  REVIEW_APPROVE = "review.approve",
  REVIEW_COMMENT = "review.comment",

  // Reporting
  REPORT_VIEW = "report.view",
  REPORT_FINANCIAL = "report.financial",
  REPORT_ANALYTICS = "report.analytics",
}

/**
 * Role constants
 */
export enum Role {
  ADMIN = "admin",
  SUPERVISOR = "supervisor",
  STAFF = "staff",
}

/**
 * Default permission sets for roles (as a reference)
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ADMIN]: Object.values(Permission),
  [Role.SUPERVISOR]: [
    Permission.SESSION_CREATE,
    Permission.SESSION_READ,
    Permission.SESSION_READ_ALL,
    Permission.SESSION_UPDATE,
    Permission.SESSION_DELETE,
    Permission.SESSION_CLOSE,
    Permission.COUNT_LINE_CREATE,
    Permission.COUNT_LINE_READ,
    Permission.COUNT_LINE_UPDATE,
    Permission.COUNT_LINE_DELETE,
    Permission.COUNT_LINE_APPROVE,
    Permission.COUNT_LINE_REJECT,
    Permission.ITEM_READ,
    Permission.ITEM_SEARCH,
    Permission.MRP_UPDATE,
    Permission.MRP_BULK_UPDATE,
    Permission.EXPORT_OWN,
    Permission.EXPORT_ALL,
    Permission.EXPORT_SCHEDULE,
    Permission.ACTIVITY_LOG_READ,
    Permission.ERROR_LOG_READ,
    Permission.DB_MAPPING_MANAGE,
    Permission.SYNC_TRIGGER,
    Permission.SYNC_RESOLVE_CONFLICT,
    Permission.REVIEW_CREATE,
    Permission.REVIEW_APPROVE,
    Permission.REVIEW_COMMENT,
    Permission.REPORT_VIEW,
    Permission.REPORT_FINANCIAL,
    Permission.REPORT_ANALYTICS,
  ],
  [Role.STAFF]: [
    Permission.SESSION_CREATE,
    Permission.SESSION_READ,
    Permission.SESSION_UPDATE,
    Permission.SESSION_CLOSE,
    Permission.COUNT_LINE_CREATE,
    Permission.COUNT_LINE_READ,
    Permission.COUNT_LINE_UPDATE,
    Permission.ITEM_READ,
    Permission.ITEM_SEARCH,
    Permission.MRP_UPDATE,
    Permission.EXPORT_OWN,
    Permission.REVIEW_CREATE,
    Permission.REVIEW_COMMENT,
  ],
};
