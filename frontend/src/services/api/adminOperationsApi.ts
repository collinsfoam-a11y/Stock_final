/**
 * Compatibility facade for the admin operations API surface.
 *
 * Previously a single ~835-line module, this is now decomposed into
 * focused domain modules under `./admin/*`. All exports are re-exported
 * here so existing imports from `@/services/api/adminOperationsApi`
 * (and the grouped objects in `api.impl.ts`) continue to work unchanged.
 *
 * Domain modules:
 *   - serviceControl   services, system health, devices, logs
 *   - permissions      role/user permission management
 *   - exportSchedules  export schedule + result management
 *   - syncConflicts    sync conflict resolution
 *   - metrics          metrics + health checks
 *   - syncStatus       sync status/stats/trigger
 *   - reports          admin control report generation
 *   - sqlServer        SQL Server config + connection aliases
 *   - security         security dashboard
 *   - settings         master settings + system settings
 */
export * from "./admin/serviceControl";
export * from "./admin/permissions";
export * from "./admin/exportSchedules";
export * from "./admin/syncConflicts";
export * from "./admin/metrics";
export * from "./admin/syncStatus";
export * from "./admin/reports";
export * from "./admin/sqlServer";
export * from "./admin/security";
export * from "./admin/settings";
