/**
 * Compatibility shim for legacy imports.
 *
 * Canonical sync scheduling now lives in `../syncService`.
 * Keep this bridge for one release cycle while older imports are retired.
 */

export { startSyncService, stopSyncService } from "../syncService";
export type { SyncSchedulerOptions as OfflineSyncSchedulerOptions } from "../syncService";
