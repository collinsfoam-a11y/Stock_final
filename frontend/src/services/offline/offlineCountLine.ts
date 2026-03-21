/**
 * Offline Count Line Service
 *
 * Single source of truth for creating offline count lines.
 * Addresses code duplication in createCountLine.
 */

import { CreateCountLinePayload } from "../../types/scan";
import { generateOfflineId } from "../../utils/uuid";
import { useAuthStore } from "../../store/authStore";
import {
  getItemFromCache,
  cacheCountLine,
  addToOfflineQueue,
  CachedCountLine,
} from "./offlineStorage";
import { createLogger } from "../logging";

const log = createLogger("OfflineCountLine");

/**
 * Device context for audit trail
 */
export interface DeviceContext {
  deviceId?: string;
  sourceScreen?: string;
  appVersion?: string;
  username?: string;
  itemName?: string;
}

/**
 * Audit metadata for offline count lines
 */
export interface OfflineAuditMetadata {
  source: string;
  device_id: string | null;
  app_version: string | null;
  created_offline: true;
  offline_created_at: string;
  sync_status: "pending";
  idempotency_key: string;
}

/**
 * Extended offline count line with audit metadata
 */
export interface OfflineCountLine extends CachedCountLine {
  audit: OfflineAuditMetadata;
}

// Default device context (can be overridden)
let globalDeviceContext: DeviceContext = {};

/**
 * Set the global device context for all offline operations.
 * Call this once during app initialization.
 */
export function setDeviceContext(context: DeviceContext): void {
  globalDeviceContext = context;
  log.info("Device context set", { context });
}

/**
 * Get the current device context
 */
export function getDeviceContext(): DeviceContext {
  return globalDeviceContext;
}

/**
 * Create an offline count line with proper UUID, audit metadata, and validation.
 *
 * This is the single source of truth for offline count line creation.
 * Both the proactive offline branch and the catch fallback should use this.
 *
 * @param countData - The count line payload
 * @param deviceContext - Optional device context (uses global if not provided)
 * @returns Created offline count line with full audit trail
 */
export async function createOfflineCountLine(
  countData: CreateCountLinePayload,
  deviceContext?: Partial<DeviceContext>
): Promise<OfflineCountLine> {
  const context = { ...globalDeviceContext, ...deviceContext };
  const user = useAuthStore.getState().user;

  let itemName =
    countData.item_name?.trim() || context.itemName?.trim() || "Unknown Item";

  if (itemName === "Unknown Item") {
    try {
      const cachedItem = await getItemFromCache(countData.item_code);
      if (cachedItem) {
        itemName = cachedItem.item_name;
      }
    } catch (error) {
      log.warn("Failed to get item from cache for offline count line", {
        itemCode: countData.item_code,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Create audit metadata
  const offlineId = generateOfflineId();
  const audit: OfflineAuditMetadata = {
    source: context.sourceScreen || "scan_screen",
    device_id: context.deviceId || null,
    app_version: context.appVersion || null,
    created_offline: true,
    offline_created_at: new Date().toISOString(),
    sync_status: "pending",
    idempotency_key: offlineId,
  };

  // Create the offline count line with UUID-based ID
  const offlineCountLine: OfflineCountLine = {
    _id: offlineId,
    idempotency_key: offlineId,
    session_id: countData.session_id,
    item_code: countData.item_code,
    item_name: itemName,
    counted_qty: countData.counted_qty,
    system_qty: undefined,
    variance: undefined,
    counted_by: user?.username || "offline_user",
    counted_at: new Date().toISOString(),
    cached_at: new Date().toISOString(),
    // Optional fields
    rack_no: countData.rack_no || undefined,
    rack: countData.rack_no || undefined,
    verified: false,
    // Audit metadata
    audit,
  };

  // Merge all request payload data into the offline record
  // This ensures we don't lose any new fields added to CreateCountLinePayload
  const finalCountLine = { ...countData, ...offlineCountLine };

  // Cache and queue
  try {
    await cacheCountLine(finalCountLine);
    await addToOfflineQueue("count_line", finalCountLine);

    log.info("Created offline count line", {
      id: finalCountLine._id,
      itemCode: finalCountLine.item_code,
      sessionId: finalCountLine.session_id,
      source: audit.source,
    });
  } catch (error) {
    log.error("Failed to persist offline count line", {
      error: error instanceof Error ? error.message : String(error),
      countLine: finalCountLine._id,
    });
    // Still return the count line even if persistence failed
    // The UI can show it, and we can retry persistence later
  }

  return finalCountLine as OfflineCountLine;
}

/**
 * Validate that a cached item has required fields for a count line.
 * Returns validation result with any issues.
 */
export function validateCountLineData(countData: CreateCountLinePayload): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!countData.session_id) {
    errors.push("session_id is required");
  }
  if (!countData.item_code) {
    errors.push("item_code is required");
  }
  if (countData.counted_qty === undefined || countData.counted_qty === null) {
    errors.push("counted_qty is required");
  }
  if (typeof countData.counted_qty !== "number" || countData.counted_qty < 0) {
    errors.push("counted_qty must be a non-negative number");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
